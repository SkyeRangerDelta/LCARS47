import { describe, it, expect, vi } from 'vitest';
import { Readable } from 'stream';
import { StreamType } from '@discordjs/voice';

import { ProviderResolver } from './ProviderResolver.js';
import type {
  MediaProvider,
  ResolvedSearchResult,
  SearchOptions
} from './Interfaces/MediaProvider.js';
import type { ProviderId, Track } from './Interfaces/Track.js';

type FakeOpts = {
  id: ProviderId;
  enabled?: boolean;
  canHandle?: (q: string) => boolean;
  search?: (q: string, opts: SearchOptions) => Promise<ResolvedSearchResult>;
};

function buildProvider(opts: FakeOpts): MediaProvider {
  return {
    id: opts.id,
    isEnabled: () => opts.enabled ?? true,
    canHandle: opts.canHandle ?? (() => false),
    search: opts.search ?? (() => Promise.resolve({ tracks: [], confidence: 'none' })),
    getStream: () => Promise.resolve({
      stream: Readable.from([]),
      streamType: StreamType.Arbitrary,
      cleanup: () => undefined
    })
  };
}

function buildTrack(id: string, source: ProviderId): Track {
  return {
    id,
    source,
    sourceRef: `ref-${id}`,
    title: id,
    url: `https://example/${id}`,
    duration: 1,
    durationFriendly: '1s',
    channelOrAlbumLabel: 'Lbl',
    requestedBy: { id: 'u', displayName: 'U' } as never,
    playStart: 0
  };
}

const requester = { id: 'u', displayName: 'U' } as never;

describe('ProviderResolver', () => {
  it('returns no-match when no providers are registered', async () => {
    const r = new ProviderResolver();
    const out = await r.resolve('anything', requester);
    expect(out.tracks).toEqual([]);
    expect(out.providerId).toBeNull();
  });

  it('falls back to the next provider when first returns confidence:none', async () => {
    const first = buildProvider({ id: 'jellyfin' });
    const second = buildProvider({
      id: 'youtube',
      search: () => Promise.resolve({ tracks: [buildTrack('y1', 'youtube')], confidence: 'fuzzy' })
    });

    const r = new ProviderResolver();
    r.register(first);
    r.register(second);

    const out = await r.resolve('query', requester);
    expect(out.providerId).toBe('youtube');
    expect(out.tracks).toHaveLength(1);
  });

  it('prefers the first provider that returns a confident match', async () => {
    const first = buildProvider({
      id: 'jellyfin',
      search: () => Promise.resolve({ tracks: [buildTrack('j1', 'jellyfin')], confidence: 'exact' })
    });
    const secondSearch = vi.fn(() => Promise.resolve({
      tracks: [buildTrack('y1', 'youtube')],
      confidence: 'fuzzy' as const
    }));
    const second = buildProvider({ id: 'youtube', search: secondSearch });

    const r = new ProviderResolver();
    r.register(first);
    r.register(second);

    const out = await r.resolve('q', requester);
    expect(out.providerId).toBe('jellyfin');
    expect(secondSearch).not.toHaveBeenCalled();
  });

  it('routes URL-shaped queries deterministically to the owner provider', async () => {
    const jellyfin = buildProvider({
      id: 'jellyfin',
      search: () => Promise.resolve({ tracks: [buildTrack('j', 'jellyfin')], confidence: 'exact' })
    });
    const yt = buildProvider({
      id: 'youtube',
      canHandle: q => q.startsWith('https://youtu'),
      search: () => Promise.resolve({ tracks: [buildTrack('y', 'youtube')], confidence: 'exact' })
    });

    const r = new ProviderResolver();
    r.register(jellyfin);
    r.register(yt);

    const out = await r.resolve('https://youtu.be/abc', requester);
    expect(out.providerId).toBe('youtube');
  });

  it('skips disabled providers', async () => {
    const disabled = buildProvider({
      id: 'jellyfin',
      enabled: false,
      search: () => Promise.resolve({ tracks: [buildTrack('j', 'jellyfin')], confidence: 'exact' })
    });
    const yt = buildProvider({
      id: 'youtube',
      search: () => Promise.resolve({ tracks: [buildTrack('y', 'youtube')], confidence: 'fuzzy' })
    });

    const r = new ProviderResolver();
    r.register(disabled);
    r.register(yt);

    const out = await r.resolve('q', requester);
    expect(out.providerId).toBe('youtube');
  });

  it('treats a thrown error as no-match for that provider', async () => {
    const broken = buildProvider({
      id: 'jellyfin',
      search: () => Promise.reject(new Error('boom'))
    });
    const yt = buildProvider({
      id: 'youtube',
      search: () => Promise.resolve({ tracks: [buildTrack('y', 'youtube')], confidence: 'fuzzy' })
    });

    const r = new ProviderResolver();
    r.register(broken);
    r.register(yt);

    const out = await r.resolve('q', requester);
    expect(out.providerId).toBe('youtube');
  });

  it('get() finds a registered provider by id', () => {
    const yt = buildProvider({ id: 'youtube' });
    const r = new ProviderResolver();
    r.register(yt);

    expect(r.get('youtube')).toBe(yt);
    expect(r.get('jellyfin')).toBeUndefined();
  });
});
