import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  downloadYtDlp: vi.fn()
}));

vi.mock('ytdlp-nodejs', () => {
  class FakeYtDlp {
    stream = vi.fn();
  }
  return {
    YtDlp: FakeYtDlp,
    helpers: { downloadYtDlp: mocks.downloadYtDlp }
  };
});

const downloadYtDlp = mocks.downloadYtDlp;

import { YtDlpManager, looksLikeYtDlpExtractionError } from './YtDlpManager.js';

describe('looksLikeYtDlpExtractionError', () => {
  it('recognises common yt-dlp extraction error strings', () => {
    expect(looksLikeYtDlpExtractionError(new Error('ERROR: Unable to extract video'))).toBe(true);
    expect(looksLikeYtDlpExtractionError(new Error('Sign in to confirm you are not a bot'))).toBe(true);
    expect(looksLikeYtDlpExtractionError(new Error('HTTP Error 403: Forbidden'))).toBe(true);
    expect(looksLikeYtDlpExtractionError('Failed to extract any player response')).toBe(true);
  });

  it('ignores unrelated errors', () => {
    expect(looksLikeYtDlpExtractionError(new Error('Network timeout'))).toBe(false);
    expect(looksLikeYtDlpExtractionError(new Error('ENOENT: no such file'))).toBe(false);
    expect(looksLikeYtDlpExtractionError('all good')).toBe(false);
  });
});

describe('YtDlpManager.update', () => {
  beforeEach(() => {
    downloadYtDlp.mockReset();
  });

  it('calls helpers.downloadYtDlp with the binary directory (not the file)', async () => {
    // helpers.downloadYtDlp(out) treats `out` as a directory and appends
    // the platform basename itself. Passing the file path produces nested
    // junk paths like bin/yt-dlp.exe/yt-dlp.exe.
    downloadYtDlp.mockResolvedValue('/tmp/yt-dlp');
    const m = new YtDlpManager({ binaryPath: '/tmp/yt-dlp' });
    await m.update();
    expect(downloadYtDlp).toHaveBeenCalledTimes(1);
    const arg: unknown = downloadYtDlp.mock.calls[0][0];
    // Either '/tmp' on POSIX-style runners or 'C:\tmp' on Windows runners.
    expect(typeof arg).toBe('string');
    expect(arg).not.toBe('/tmp/yt-dlp');
  });

  it('dedupes concurrent updates (one download serves multiple callers)', async () => {
    let resolveDownload: () => void = () => undefined;
    downloadYtDlp.mockImplementation(
      () => new Promise<void>(res => { resolveDownload = res; })
    );

    const m = new YtDlpManager({ binaryPath: '/tmp/yt-dlp' });
    const a = m.update();
    const b = m.update();
    const c = m.update();

    resolveDownload();
    await Promise.all([a, b, c]);

    expect(downloadYtDlp).toHaveBeenCalledTimes(1);
  });

  it('clears the in-flight lock on failure so a retry can proceed', async () => {
    downloadYtDlp.mockRejectedValueOnce(new Error('network down'));
    const m = new YtDlpManager({ binaryPath: '/tmp/yt-dlp' });

    await expect(m.update()).rejects.toThrow('network down');

    downloadYtDlp.mockResolvedValueOnce(undefined);
    await expect(m.update()).resolves.toBeUndefined();
    expect(downloadYtDlp).toHaveBeenCalledTimes(2);
  });
});
