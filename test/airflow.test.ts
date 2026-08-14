import { describe, expect, it } from 'vitest';
import { computeAirflow, type AirflowInput } from '../src/data/airflow';

const base: AirflowInput = {
  windFrom: 0,
  speed: 20,
  facadeBearing: 0,
  weakBelow: 5,
  sidewaysFrom: 45,
};

describe('computeAirflow', () => {
  it('calls wind arriving from the direction the facade faces front-to-back', () => {
    // Front faces north-east; wind comes out of the north-east.
    expect(computeAirflow({ ...base, facadeBearing: 45, windFrom: 45 }).bucket).toBe(
      'front_to_back',
    );
    expect(computeAirflow({ ...base, facadeBearing: 45, windFrom: 60 }).bucket).toBe(
      'front_to_back',
    );
  });

  it('calls wind arriving from behind back-to-front', () => {
    expect(computeAirflow({ ...base, facadeBearing: 45, windFrom: 225 }).bucket).toBe(
      'back_to_front',
    );
    expect(computeAirflow({ ...base, facadeBearing: 0, windFrom: 180 }).bucket).toBe(
      'back_to_front',
    );
  });

  it('calls everything in between sideways', () => {
    expect(computeAirflow({ ...base, facadeBearing: 0, windFrom: 90 }).bucket).toBe('sideways');
    expect(computeAirflow({ ...base, facadeBearing: 0, windFrom: 270 }).bucket).toBe('sideways');
  });

  it('honours the sideways threshold at its boundaries', () => {
    expect(computeAirflow({ ...base, windFrom: 45, sidewaysFrom: 45 }).bucket).toBe('sideways');
    expect(computeAirflow({ ...base, windFrom: 44.9, sidewaysFrom: 45 }).bucket).toBe(
      'front_to_back',
    );
    expect(computeAirflow({ ...base, windFrom: 135.1, sidewaysFrom: 45 }).bucket).toBe(
      'back_to_front',
    );
  });

  it('works across the 0/360 wrap', () => {
    expect(computeAirflow({ ...base, facadeBearing: 350, windFrom: 10 }).bucket).toBe(
      'front_to_back',
    );
    expect(computeAirflow({ ...base, facadeBearing: 10, windFrom: 350 }).bucket).toBe(
      'front_to_back',
    );
  });

  it('reports weak wind below the threshold, whatever the direction', () => {
    expect(computeAirflow({ ...base, speed: 4.9 }).bucket).toBe('weak');
    expect(computeAirflow({ ...base, speed: 0 }).bucket).toBe('weak');
    expect(computeAirflow({ ...base, speed: 5 }).bucket).toBe('front_to_back');
  });

  it('does not claim weak wind when the speed is simply unreadable', () => {
    const result = computeAirflow({ ...base, speed: null });
    expect(result.bucket).toBe('front_to_back');
  });

  it('reports unknown when there is no bearing', () => {
    const result = computeAirflow({ ...base, windFrom: null });
    expect(result.bucket).toBe('unknown');
    expect(result.delta).toBeNull();
  });

  it('clamps a nonsensical sideways threshold instead of misclassifying', () => {
    expect(computeAirflow({ ...base, windFrom: 90, sidewaysFrom: 0 }).bucket).toBe('sideways');
    expect(computeAirflow({ ...base, windFrom: 90, sidewaysFrom: 999 }).bucket).toBe('sideways');
    expect(computeAirflow({ ...base, windFrom: 89, sidewaysFrom: 90 }).bucket).toBe(
      'front_to_back',
    );
  });

  it('matches the Jinja template helper it replaces, at every bearing', () => {
    // Captured from the original Home Assistant template helper:
    //   {% set d = ((((raw - front + 180) % 360) - 180) | abs) %}
    //   {% if d < 70 %}Front → Back{% elif d <= 110 %}Sideways{% else %}Back → Front{% endif %}
    // evaluated server-side for front=166.52 over bearings 0..355 step 5.
    // This is the contract for anyone migrating off such a sensor: if this
    // string changes, the card silently disagrees with the template it replaced.
    const expected = 'BBBBBBBBBBBBSSSSSSSSFFFFFFFFFFFFFFFFFFFFFFFFFFFFSSSSSSSSBBBBBBBBBBBBBBBB';
    const code = { front_to_back: 'F', sideways: 'S', back_to_front: 'B', weak: 'W', unknown: '?' };

    let actual = '';
    for (let bearing = 0; bearing < 360; bearing += 5) {
      const result = computeAirflow({
        windFrom: bearing,
        speed: 10,
        facadeBearing: 166.52,
        weakBelow: 5,
        sidewaysFrom: 70,
      });
      actual += code[result.bucket];
    }

    expect(actual).toBe(expected);
  });

  it('reports the absolute angle to the facade', () => {
    expect(computeAirflow({ ...base, facadeBearing: 0, windFrom: 90 }).delta).toBe(90);
    expect(computeAirflow({ ...base, facadeBearing: 0, windFrom: 270 }).delta).toBe(90);
    expect(computeAirflow({ ...base, facadeBearing: 45, windFrom: 45 }).delta).toBe(0);
  });
});
