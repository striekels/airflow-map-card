import { describe, expect, it } from 'vitest';

import { DEFAULT_FLOW_OPACITY, DEFAULT_FLOW_SPEED, resolveFlow } from '../src/data/flow';

describe('resolveFlow', () => {
  it('is on at half opacity and normal pace when nothing is configured', () => {
    expect(resolveFlow(undefined)).toEqual({ show: true, opacity: 0.5, speed: 1 });
  });

  it('accepts the boolean shorthand', () => {
    expect(resolveFlow(true)).toEqual({ show: true, opacity: 0.5, speed: 1 });
    expect(resolveFlow(false)).toEqual({ show: false, opacity: 0.5, speed: 1 });
  });

  it('keeps a configured value and defaults only what is missing', () => {
    expect(resolveFlow({ opacity: 1 })).toEqual({ show: true, opacity: 1, speed: 1 });
    expect(resolveFlow({ speed: 2.5 })).toEqual({ show: true, opacity: 0.5, speed: 2.5 });
  });

  it('keeps a zero rather than reading it as missing', () => {
    // `||` here would replace a deliberate 0 with the default, which is the
    // difference between an invisible flow and a half-visible one.
    expect(resolveFlow({ opacity: 0 }).opacity).toBe(0);
  });

  it('defaults a cleared field, which a form sends as undefined', () => {
    expect(resolveFlow({ show: undefined, opacity: undefined })).toEqual({
      show: true,
      opacity: DEFAULT_FLOW_OPACITY,
      speed: DEFAULT_FLOW_SPEED,
    });
  });
});
