import { describe, expect, it } from 'vitest';
import { DEFAULT_PADDING, aspectRatioPadding } from '../src/map/aspect';

describe('aspectRatioPadding', () => {
  it('converts a w / h ratio to height-over-width padding', () => {
    expect(aspectRatioPadding('4 / 3')).toBe('75%');
    expect(aspectRatioPadding('4/3')).toBe('75%');
    expect(aspectRatioPadding('16 / 9')).toBe('56.25%');
    expect(aspectRatioPadding('1 / 1')).toBe('100%');
  });

  it('accepts a bare number as width-over-height', () => {
    expect(aspectRatioPadding('2')).toBe('50%');
    expect(aspectRatioPadding('1')).toBe('100%');
  });

  it('falls back rather than emitting invalid CSS', () => {
    for (const input of ['', 'wide', '4 / abc', '0 / 3', '4 / 0', '-4 / 3', '1/2/3']) {
      expect(aspectRatioPadding(input)).toBe(DEFAULT_PADDING);
    }
    expect(aspectRatioPadding(undefined)).toBe(DEFAULT_PADDING);
  });

  it('clamps extremes so the card cannot become invisible or enormous', () => {
    expect(aspectRatioPadding('100 / 1')).toBe('20%');
    expect(aspectRatioPadding('1 / 100')).toBe('400%');
  });
});
