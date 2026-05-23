import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'stream';
import { StreamType } from '@discordjs/voice';

import type { LCARSClient } from '../Auxiliary/LCARSClient.js';
import type { Track } from './Interfaces/Track.js';
import type { MediaProvider, ResolvedSearchResult, SearchOptions } from './Interfaces/MediaProvider.js';
import { MediaPlayerService } from './MediaPlayerService.js';
import { ProviderResolver } from './ProviderResolver.js';

const GUILD_ID = 'guild-1';
const REPORT_CHANNEL_ID = 'media-log';

function buildStubClient(): LCARSClient {
  return {
    PLDYN: {
      channels: { fetch: vi.fn().mockResolvedValue(null) }
    }
  } as unknown as LCARSClient;
}

function buildVoiceChannel(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: 'vc-1',
    name: 'Test VC',
    guild: { voiceAdapterCreator: () => () => ({ destroy: () => undefined }) },
    members: { size: 1 },
    ...overrides
  };
}

function buildTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    source: 'youtube',
    sourceRef: 'https://youtu.be/abc',
    title: 'Stub Track',
    url: 'https://youtu.be/abc',
    duration: 60,
    durationFriendly: '1:00',
    channelOrAlbumLabel: 'Stub Channel',
    requestedBy: { id: 'u-1', displayName: 'Tester' } as unknown as Track['requestedBy'],
    playStart: 0,
    ...overrides
  };
}

class FakeProvider implements MediaProvider {
  readonly id: 'youtube' | 'jellyfin' | 'local';
  searchImpl: (q: string, opts: SearchOptions) => Promise<ResolvedSearchResult>;

  constructor(id: 'youtube' | 'jellyfin' | 'local') {
    this.id = id;
    this.searchImpl = () => Promise.resolve({ tracks: [], confidence: 'none' });
  }

  isEnabled(): boolean { return true; }
  canHandle(): boolean { return false; }
  search(q: string, opts: SearchOptions) { return this.searchImpl(q, opts); }
  getStream() {
    return Promise.resolve({
      stream: Readable.from([]),
      streamType: StreamType.Arbitrary,
      cleanup: () => undefined
    });
  }
}

function buildService(opts: { fakeProvider?: FakeProvider } = {}) {
  const resolver = new ProviderResolver();
  if (opts.fakeProvider) resolver.register(opts.fakeProvider);
  return new MediaPlayerService(buildStubClient(), {
    guildId: GUILD_ID,
    reportChannelId: REPORT_CHANNEL_ID,
    resolver,
    joinChannelFn: () => { throw new Error('voice not exercised'); }
  });
}

describe('MediaPlayerService — idle state', () => {
  it('reports no activity when nothing is queued', () => {
    const service = buildService();
    expect(service.isActive()).toBe(false);
    expect(service.isPlaying()).toBe(false);
    expect(service.getQueue()).toEqual([]);
    expect(service.getNowPlaying()).toBeNull();
    expect(service.getBoundVoiceChannel()).toBeNull();
  });

  it('stop() returns false when there is no player', () => {
    expect(buildService().stop()).toBe(false);
  });

  it('skip() returns false when there is nothing to skip', async () => {
    await expect(buildService().skip()).resolves.toBe(false);
  });
});

describe('MediaPlayerService — enqueue resolution', () => {
  let provider: FakeProvider;

  beforeEach(() => {
    provider = new FakeProvider('youtube');
  });

  it('returns no-results when no provider produces a track', async () => {
    provider.searchImpl = () => Promise.resolve({ tracks: [], confidence: 'none' });
    const service = buildService({ fakeProvider: provider });

    const result = await service.enqueue(
      'a query that finds nothing',
      buildVoiceChannel() as never,
      { id: 'u' } as never
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('no-results');
    expect(service.isActive()).toBe(false);
  });

  it('returns the resolved track on successful enqueue', async () => {
    const track = buildTrack({ id: 't1', title: 'First' });
    provider.searchImpl = () => Promise.resolve({ tracks: [track], confidence: 'fuzzy' });
    const service = buildService({ fakeProvider: provider });

    const result = await service.enqueue(
      'q1',
      buildVoiceChannel() as never,
      { id: 'u' } as never
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.startedPlayback).toBe(true);
      expect(result.track.id).toBe('t1');
      expect(result.track.title).toBe('First');
    }
  });
});
