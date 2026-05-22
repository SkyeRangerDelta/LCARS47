import { describe, it, expect, vi } from 'vitest';
import { Readable } from 'stream';
import { StreamType } from '@discordjs/voice';

import { JellyfinProvider } from './JellyfinProvider.js';
import { LocalFileProvider, LocalUnreachableError } from './LocalFileProvider.js';
import type { JellyfinClient } from '../../Jellyfin/JellyfinClient.js';
import type { JellyfinItem } from '../../Jellyfin/Interfaces/JellyfinItem.js';
import type { Track } from '../Interfaces/Track.js';

function makeClient(overrides: Partial<{
  isReady: boolean;
  searchAudio: (q: string, limit?: number) => Promise<JellyfinItem[]>;
  expandContainer: (id: string) => Promise<JellyfinItem[]>;
  buildStreamUrl: (id: string) => string;
}> = {}): JellyfinClient {
  return {
    isReady: () => overrides.isReady ?? true,
    searchAudio: overrides.searchAudio ?? (() => Promise.resolve([])),
    expandContainer: overrides.expandContainer ?? (() => Promise.resolve([])),
    buildStreamUrl: overrides.buildStreamUrl ?? (id => `http://stub/audio/${id}`)
  } as unknown as JellyfinClient;
}

const requester = { id: 'u', displayName: 'U' } as never;

describe('JellyfinProvider.isEnabled', () => {
  it('mirrors the client.isReady() state', () => {
    const enabled = new JellyfinProvider(makeClient({ isReady: true }), new LocalFileProvider());
    const disabled = new JellyfinProvider(makeClient({ isReady: false }), new LocalFileProvider());
    expect(enabled.isEnabled()).toBe(true);
    expect(disabled.isEnabled()).toBe(false);
  });

  it('returns confidence:none when the client is not ready', async () => {
    const p = new JellyfinProvider(makeClient({ isReady: false }), new LocalFileProvider());
    const result = await p.search('hello', { requestedBy: requester });
    expect(result.confidence).toBe('none');
    expect(result.tracks).toEqual([]);
  });
});

describe('JellyfinProvider.search', () => {
  it('converts a single audio hit into a Track', async () => {
    const client = makeClient({
      searchAudio: () => Promise.resolve<JellyfinItem[]>([{
        id: 'a1', kind: 'audio', name: 'Hello',
        artist: 'Adele', album: '25',
        duration: 200, path: '/media/music/Adele/25/01.flac'
      }])
    });
    const p = new JellyfinProvider(client, new LocalFileProvider());

    const result = await p.search('hello', { requestedBy: requester });
    expect(result.tracks).toHaveLength(1);
    const t = result.tracks[0];
    expect(t.source).toBe('jellyfin');
    expect(t.id).toBe('a1');
    expect(t.sourceRef).toBe('/media/music/Adele/25/01.flac');
    expect(t.channelOrAlbumLabel).toBe('Adele — 25');
  });

  it('expands an album hit into its tracks (playlist queuing)', async () => {
    const albumHit: JellyfinItem = {
      id: 'album-1', kind: 'album', name: 'Best of',
      artist: 'Band', duration: 0
    };
    const tracks: JellyfinItem[] = [
      { id: 't1', kind: 'audio', name: 'T1', artist: 'Band', album: 'Best of', duration: 120, path: '/m/t1.flac' },
      { id: 't2', kind: 'audio', name: 'T2', artist: 'Band', album: 'Best of', duration: 130, path: '/m/t2.flac' }
    ];

    const expand = vi.fn(() => Promise.resolve(tracks));
    const client = makeClient({
      searchAudio: () => Promise.resolve([albumHit]),
      expandContainer: expand
    });
    const p = new JellyfinProvider(client, new LocalFileProvider());

    const result = await p.search('best of', { requestedBy: requester });
    expect(expand).toHaveBeenCalledWith('album-1');
    expect(result.tracks.map(t => t.id)).toEqual(['t1', 't2']);
    expect(result.confidence).toBe('exact');
  });
});

describe('JellyfinProvider.getStream', () => {
  it('returns the local stream when path is reachable', async () => {
    const getLocalStream = vi.fn(() => Promise.resolve({
      stream: Readable.from([]),
      streamType: StreamType.OggOpus,
      cleanup: () => undefined
    }));
    const fakeLocal = { getStream: getLocalStream } as unknown as LocalFileProvider;

    const client = makeClient();
    const p = new JellyfinProvider(client, fakeLocal);
    const track: Track = {
      id: 'a1', source: 'jellyfin', sourceRef: '/mnt/nas/music/song.opus',
      title: 'S', url: 'jellyfin://a1', duration: 1, durationFriendly: '1s',
      channelOrAlbumLabel: 'lbl', requestedBy: requester, playStart: 0
    };

    const handle = await p.getStream(track);
    expect(handle.streamType).toBe(StreamType.OggOpus);
    expect(getLocalStream).toHaveBeenCalledTimes(1);
  });

  it('falls back to HTTP when local is unreachable', async () => {
    const fakeLocal = {
      getStream: vi.fn(() => Promise.reject(new LocalUnreachableError('/no/where')))
    } as unknown as LocalFileProvider;
    const buildStreamUrl = vi.fn((id: string) => `http://nope.invalid/${id}`);
    const client = makeClient({ buildStreamUrl });
    const p = new JellyfinProvider(client, fakeLocal);

    const track: Track = {
      id: 'a1', source: 'jellyfin', sourceRef: '/no/where',
      title: 'S', url: 'jellyfin://a1', duration: 1, durationFriendly: '1s',
      channelOrAlbumLabel: 'lbl', requestedBy: requester, playStart: 0
    };

    // The HTTP fetch will fail (invalid host); we just want to confirm we
    // got past the local attempt and into the HTTP path.
    await expect(p.getStream(track)).rejects.toBeInstanceOf(Error);
    expect(buildStreamUrl).toHaveBeenCalledWith('a1');
  });
});
