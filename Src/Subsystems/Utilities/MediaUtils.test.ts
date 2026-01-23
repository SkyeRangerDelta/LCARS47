import { describe, it, expect } from 'vitest';
import { convertDuration, convertSecondsToHMS } from './MediaUtils.js';

describe('convertDuration', () => {
  it('returns "Livestream" for 0 seconds', () => {
    expect(convertDuration(0)).toBe('Livestream');
  });

  it('formats durations under an hour (MM:SS)', () => {
    expect(convertDuration(30)).toBe('00:30');
    expect(convertDuration(90)).toBe('01:30');
    expect(convertDuration(599)).toBe('09:59');
    expect(convertDuration(3599)).toBe('59:59');
  });

  it('formats durations of an hour or more (HH:MM:SS)', () => {
    expect(convertDuration(3600)).toBe('01:00:00');
    expect(convertDuration(3661)).toBe('01:01:01');
    expect(convertDuration(7200)).toBe('02:00:00');
    expect(convertDuration(36000)).toBe('10:00:00');
  });
});

describe('convertSecondsToHMS', () => {
  it('returns "0" for 0 seconds', () => {
    expect(convertSecondsToHMS(0)).toBe('0');
  });

  it('formats seconds only with "s" suffix', () => {
    expect(convertSecondsToHMS(1)).toBe('1s');
    expect(convertSecondsToHMS(45)).toBe('45s');
    expect(convertSecondsToHMS(59)).toBe('59s');
  });

  it('formats minutes and seconds', () => {
    expect(convertSecondsToHMS(60)).toBe('1:00');
    expect(convertSecondsToHMS(90)).toBe('1:30');
    expect(convertSecondsToHMS(125)).toBe('2:05');
    expect(convertSecondsToHMS(3599)).toBe('59:59');
  });

  it('formats hours, minutes, and seconds', () => {
    expect(convertSecondsToHMS(3600)).toBe('1:00:00');
    expect(convertSecondsToHMS(3661)).toBe('1:01:01');
    expect(convertSecondsToHMS(7325)).toBe('2:02:05');
    expect(convertSecondsToHMS(36000)).toBe('10:00:00');
  });

  it('pads minutes with leading zero when hours present', () => {
    expect(convertSecondsToHMS(3660)).toBe('1:01:00');
    expect(convertSecondsToHMS(3720)).toBe('1:02:00');
  });
});
