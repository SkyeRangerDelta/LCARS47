import { describe, it, expect } from 'vitest';
import { promises as fsp } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { StreamType } from '@discordjs/voice';

import {
  LocalFileProvider,
  LocalUnreachableError,
  parsePathMap,
  translatePath
} from './LocalFileProvider.js';
import type { Track } from '../Interfaces/Track.js';

describe('parsePathMap', () => {
  it('returns empty array for undefined or empty input', () => {
    expect(parsePathMap(undefined)).toEqual([]);
    expect(parsePathMap('')).toEqual([]);
    expect(parsePathMap('   ')).toEqual([]);
  });

  it('parses a single mapping', () => {
    expect(parsePathMap('/media/music=>/mnt/nas/music')).toEqual([
      { from: '/media/music', to: '/mnt/nas/music' }
    ]);
  });

  it('parses multiple comma-separated mappings', () => {
    const result = parsePathMap('/media/music=>/mnt/nas/music,/media/audiobooks=>/mnt/nas/ab');
    expect(result).toEqual([
      { from: '/media/music', to: '/mnt/nas/music' },
      { from: '/media/audiobooks', to: '/mnt/nas/ab' }
    ]);
  });

  it('drops malformed entries silently', () => {
    expect(parsePathMap('valid=>ok,no-arrow-here,=>missing-from,from=>')).toEqual([
      { from: 'valid', to: 'ok' }
    ]);
  });
});

describe('translatePath', () => {
  const mappings = [
    { from: '/media/music', to: '/mnt/nas/music' },
    { from: '/media/abk', to: '/mnt/nas/abk' }
  ];

  it('replaces matching prefix', () => {
    expect(translatePath('/media/music/Artist/Album/01.flac', mappings))
      .toBe('/mnt/nas/music/Artist/Album/01.flac');
  });

  it('uses first matching mapping in order', () => {
    expect(translatePath('/media/abk/foo.mp3', mappings))
      .toBe('/mnt/nas/abk/foo.mp3');
  });

  it('returns path unchanged when no mapping matches', () => {
    expect(translatePath('/somewhere/else.mp3', mappings))
      .toBe('/somewhere/else.mp3');
  });
});

describe('LocalFileProvider.getStream', () => {
  it('throws LocalUnreachableError when the file is not readable', async () => {
    const provider = new LocalFileProvider();
    const track: Track = {
      id: 't', source: 'local', sourceRef: '/does/not/exist/file.mp3',
      title: 't', url: '', duration: 1, durationFriendly: '1s',
      channelOrAlbumLabel: '', requestedBy: { id: 'u' } as never, playStart: 0
    };

    await expect(provider.getStream(track)).rejects.toBeInstanceOf(LocalUnreachableError);
  });

  it('opens a stream for a real file and reports the right StreamType', async () => {
    const path = join(tmpdir(), `lcars-test-${Date.now()}.opus`);
    await fsp.writeFile(path, Buffer.from([0]));

    try {
      const provider = new LocalFileProvider();
      const handle = await provider.getStream({
        id: 't', source: 'local', sourceRef: path,
        title: 't', url: '', duration: 1, durationFriendly: '1s',
        channelOrAlbumLabel: '', requestedBy: { id: 'u' } as never, playStart: 0
      });

      expect(handle.streamType).toBe(StreamType.OggOpus);
      handle.cleanup?.();
    }
    finally {
      await fsp.unlink(path).catch(() => undefined);
    }
  });
});
