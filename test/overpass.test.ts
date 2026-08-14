import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OverpassError,
  describeBuilding,
  fetchFootprints,
  parseFootprints,
} from '../src/data/overpass';

function way(tags: Record<string, string>, points: Array<[number, number]>) {
  return { id: 1, tags, geometry: points.map(([lat, lon]) => ({ lat, lon })) };
}

const SQUARE: Array<[number, number]> = [
  [51.0, 5.0],
  [51.0, 5.001],
  [51.001, 5.001],
  [51.0, 5.0],
];

describe('parseFootprints', () => {
  it('separates buildings from roads', () => {
    const result = parseFootprints([
      way({ building: 'house' }, SQUARE),
      way({ highway: 'residential', name: 'Somewhere' }, [
        [51.0, 5.0],
        [51.0, 5.002],
      ]),
    ]);
    expect(result.buildings).toHaveLength(1);
    expect(result.roads).toHaveLength(1);
    expect(result.roads[0]).toHaveLength(2);
  });

  it('keeps address tags when present and omits the key when not', () => {
    const [withAddress, without] = parseFootprints([
      way({ building: 'house', 'addr:street': 'Mill Lane', 'addr:housenumber': '55' }, SQUARE),
      way({ building: 'yes' }, SQUARE),
    ]).buildings;

    expect(withAddress.address).toEqual({ street: 'Mill Lane', housenumber: '55' });
    expect(without.address).toBeUndefined();
  });

  it('ignores ways with no usable geometry', () => {
    const result = parseFootprints([
      { id: 1, tags: { building: 'house' } },
      { id: 2, tags: { building: 'house' }, geometry: [{ lat: 51, lon: 5 }] },
      way({ building: 'house' }, SQUARE),
    ]);
    expect(result.buildings).toHaveLength(1);
  });

  it('ignores ways that are neither buildings nor roads', () => {
    const result = parseFootprints([way({ landuse: 'grass' }, SQUARE)]);
    expect(result).toEqual({ buildings: [], roads: [] });
  });
});

describe('describeBuilding', () => {
  it('joins street and house number', () => {
    expect(
      describeBuilding({ ring: [], address: { street: 'Mill Lane', housenumber: '55' } }),
    ).toBe('Mill Lane 55');
  });

  it('copes with only one of the two', () => {
    expect(describeBuilding({ ring: [], address: { housenumber: '55' } })).toBe('55');
    expect(describeBuilding({ ring: [], address: { street: 'Mill Lane' } })).toBe('Mill Lane');
  });

  it('returns undefined when there is nothing to say', () => {
    expect(describeBuilding({ ring: [] })).toBeUndefined();
    expect(describeBuilding(undefined)).toBeUndefined();
  });
});

function jsonResponse(elements: unknown[]): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ elements }),
  } as unknown as Response;
}

function statusResponse(status: number): Response {
  return { ok: false, status, json: async () => ({}) } as unknown as Response;
}

describe('fetchFootprints', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('uses GET with the query in the URL', async () => {
    // Not cosmetic. A POST whose content type Overpass rejects returns 406 with
    // no Access-Control-Allow-Origin header, which the browser reports as an
    // opaque CORS failure. GET carries no body, so there is nothing to
    // negotiate and no preflight.
    fetchMock.mockResolvedValue(jsonResponse([]));
    await fetchFootprints(11.1, 21.1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe('GET');
    expect(init?.body).toBeUndefined();
    expect(String(url)).toContain('overpass-api.de/api/interpreter?data=');
    expect(decodeURIComponent(String(url))).toContain('["building"]');
  });

  it('retries a transient overload and succeeds', async () => {
    // Measured against the live service: a 504 is routinely followed by a 200
    // seconds later, which is why retrying beats failing the user immediately.
    fetchMock
      .mockResolvedValueOnce(statusResponse(504))
      .mockResolvedValueOnce(jsonResponse([way({ building: 'house' }, SQUARE)]));

    const promise = fetchFootprints(10.1, 20.1);
    await vi.advanceTimersByTimeAsync(2000);

    expect((await promise).buildings).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after exhausting the backoff, and says it retried', async () => {
    fetchMock.mockResolvedValue(statusResponse(429));

    const settled = fetchFootprints(10.2, 20.2).catch((error) => error);
    await vi.advanceTimersByTimeAsync(10000);
    const error = await settled;

    expect(error).toBeInstanceOf(OverpassError);
    expect(error.message).toContain('busy');
    expect(error.message).toContain('retried');
    // One attempt plus one per backoff step.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('caches a success so a second press costs the service nothing', async () => {
    fetchMock.mockResolvedValue(jsonResponse([way({ building: 'house' }, SQUARE)]));

    const first = await fetchFootprints(10.3, 20.3);
    const second = await fetchFootprints(10.3, 20.3);

    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failure', async () => {
    fetchMock.mockResolvedValueOnce(statusResponse(400));
    await expect(fetchFootprints(10.4, 20.4)).rejects.toThrow(/HTTP 400/);

    fetchMock.mockResolvedValueOnce(jsonResponse([]));
    await expect(fetchFootprints(10.4, 20.4)).resolves.toEqual({ buildings: [], roads: [] });
  });

  it('does not retry a non-transient error', async () => {
    fetchMock.mockResolvedValue(statusResponse(400));
    await expect(fetchFootprints(10.5, 20.5)).rejects.toThrow(/HTTP 400/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('points at connectivity when fetch throws rather than responds', async () => {
    // A thrown fetch is a network-level block: CSP, DNS, an extension. The
    // message has to distinguish that from the service being busy.
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const promise = fetchFootprints(10.6, 20.6);
    const assertion = expect(promise).rejects.toThrow(/allowed to connect/);
    await vi.advanceTimersByTimeAsync(10000);
    await assertion;
  });

  it('propagates an abort instead of turning it into a lookup error', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(
      () =>
        new Promise((_, reject) =>
          controller.signal.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          ),
        ),
    );

    const promise = fetchFootprints(10.7, 20.7, controller.signal);
    const assertion = expect(promise).rejects.toThrow(/Aborted/);
    controller.abort();
    await assertion;
  });

  it('rejects unreadable JSON without retrying forever', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('bad json');
      },
    } as unknown as Response);

    await expect(fetchFootprints(10.8, 20.8)).rejects.toThrow(/unreadable/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
