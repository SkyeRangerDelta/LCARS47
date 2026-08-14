import { describe, it, expect } from 'vitest';
import { JellyfinClient } from './JellyfinClient.js';

describe('JellyfinClient.normaliseBaseUrl', () => {
  it('adds http:// when scheme missing', () => {
    expect(JellyfinClient.normaliseBaseUrl('jellyfin.example', '8096'))
      .toBe('http://jellyfin.example:8096');
  });

  it('keeps explicit scheme', () => {
    expect(JellyfinClient.normaliseBaseUrl('https://jellyfin.example', '8096'))
      .toBe('https://jellyfin.example:8096');
  });

  it('does not double-add port when scheme URL already contains one', () => {
    expect(JellyfinClient.normaliseBaseUrl('http://jellyfin.example:9000', '8096'))
      .toBe('http://jellyfin.example:9000');
  });

  it('trims trailing slashes', () => {
    expect(JellyfinClient.normaliseBaseUrl('http://jellyfin.example/', '8096'))
      .toBe('http://jellyfin.example:8096');
  });

  it('omits port when not provided', () => {
    expect(JellyfinClient.normaliseBaseUrl('https://jellyfin.example'))
      .toBe('https://jellyfin.example');
  });
});

describe('JellyfinClient pre-connect guards', () => {
  it('refuses to search before connect/authenticate', async () => {
    const c = new JellyfinClient({
      host: 'jellyfin.example', port: '8096',
      username: 'u', password: 'p'
    });
    await expect(c.searchAudio('hello')).rejects.toThrow(/not connected/i);
  });

  it('refuses to build stream URL before authentication', () => {
    const c = new JellyfinClient({
      host: 'jellyfin.example', port: '8096',
      username: 'u', password: 'p'
    });
    expect(() => c.buildStreamUrl('item-123')).toThrow(/access token/i);
  });

  it('isReady() is false until connect + authenticate complete', () => {
    const c = new JellyfinClient({
      host: 'jellyfin.example', port: '8096',
      username: 'u', password: 'p'
    });
    expect(c.isReady()).toBe(false);
    c.connect();
    expect(c.isReady()).toBe(false); // still need authenticate
  });
});
