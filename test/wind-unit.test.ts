import { describe, expect, it } from 'vitest';

import {
  beaufort,
  beaufortLowerBound,
  convertSpeed,
  fromMetresPerSecond,
  speedUnitLabel,
  thresholdMetresPerSecond,
} from '../src/data/wind-speed';

describe('convertSpeed', () => {
  it('leaves the reading alone when no unit is chosen', () => {
    // The default, and what the card did before the option existed.
    expect(convertSpeed(36, 'km/h', undefined)).toBe(36);
    expect(convertSpeed(36, 'km/h', 'source')).toBe(36);
  });

  it('converts rather than relabels', () => {
    // The trap this option closes: `unit: mph` on a row prints a km/h number
    // beside the word mph.
    expect(convertSpeed(36, 'km/h', 'm/s')).toBeCloseTo(10, 9);
    expect(convertSpeed(36, 'km/h', 'mph')).toBeCloseTo(22.369, 3);
    expect(convertSpeed(36, 'km/h', 'kn')).toBeCloseTo(19.438, 3);
  });

  it('round trips through every unit it offers', () => {
    for (const unit of ['km/h', 'm/s', 'mph', 'kn'] as const) {
      const converted = convertSpeed(42, 'km/h', unit)!;
      expect(convertSpeed(converted, unit, 'km/h')).toBeCloseTo(42, 6);
    }
  });

  it('agrees with the inverse it is built on', () => {
    expect(fromMetresPerSecond(10, 'km/h')).toBeCloseTo(36, 9);
    expect(fromMetresPerSecond(10, 'mph')).toBeCloseTo(22.369, 3);
  });

  it('carries an unreadable speed through as unreadable', () => {
    expect(convertSpeed(null, 'km/h', 'mph')).toBeNull();
    expect(convertSpeed(Number.NaN, 'km/h', 'mph')).toBeNull();
  });
});

describe('beaufort', () => {
  it('puts each force at its own lower bound', () => {
    expect(beaufort(0)).toBe(0);
    expect(beaufort(0.5)).toBe(1);
    expect(beaufort(3.4)).toBe(3);
    expect(beaufort(8)).toBe(5);
    expect(beaufort(20.8)).toBe(9);
  });

  it('rounds down into the force the wind is actually in', () => {
    // 7.9 m/s is still a force 4, not "nearly 5". The scale is bands.
    expect(beaufort(7.9)).toBe(4);
    expect(beaufort(3.39)).toBe(2);
  });

  it('holds at 12, since the scale stops there', () => {
    expect(beaufort(40)).toBe(12);
    expect(beaufort(200)).toBe(12);
  });

  it('treats nonsense as calm rather than as a hurricane', () => {
    expect(beaufort(-3)).toBe(0);
    expect(beaufort(Number.NaN)).toBe(0);
  });

  it('is a whole number through convertSpeed', () => {
    expect(convertSpeed(36, 'km/h', 'bft')).toBe(5);
    expect(Number.isInteger(convertSpeed(37.4, 'km/h', 'bft'))).toBe(true);
  });
});

describe('thresholdMetresPerSecond', () => {
  it('reads the threshold in the source unit when no display unit is set', () => {
    expect(thresholdMetresPerSecond(36, undefined, 'km/h')).toBeCloseTo(10, 9);
    expect(thresholdMetresPerSecond(10, 'source', 'm/s')).toBeCloseTo(10, 9);
  });

  it('reads it in the displayed unit, not the source unit', () => {
    // The whole point: the number in the field is the number on the card.
    expect(thresholdMetresPerSecond(10, 'm/s', 'km/h')).toBeCloseTo(10, 9);
    expect(thresholdMetresPerSecond(10, 'mph', 'km/h')).toBeCloseTo(4.4704, 4);
  });

  it('reads a Beaufort threshold as where that force begins', () => {
    expect(thresholdMetresPerSecond(3, 'bft', 'km/h')).toBe(3.4);
    expect(beaufortLowerBound(5)).toBe(8);
  });

  it('clamps a Beaufort force outside the scale', () => {
    expect(thresholdMetresPerSecond(99, 'bft', 'km/h')).toBe(beaufortLowerBound(12));
    expect(thresholdMetresPerSecond(-4, 'bft', 'km/h')).toBe(0);
  });
});

describe('speedUnitLabel', () => {
  it('falls back to the source label when nothing is chosen', () => {
    expect(speedUnitLabel(undefined, 'km/h')).toBe('km/h');
    expect(speedUnitLabel('source', 'm/s')).toBe('m/s');
    expect(speedUnitLabel(undefined, null)).toBeNull();
  });

  it('writes Beaufort the way people write it', () => {
    expect(speedUnitLabel('bft', 'km/h')).toBe('Bft');
    expect(speedUnitLabel('mph', 'km/h')).toBe('mph');
  });
});
