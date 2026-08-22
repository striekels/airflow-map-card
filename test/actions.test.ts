import { describe, expect, it } from 'vitest';

import { safeUrl } from '../src/data/actions';

const BASE = 'https://ha.local:8123/lovelace/climate';

describe('safeUrl', () => {
  it('allows the two schemes a dashboard link ever needs', () => {
    expect(safeUrl('https://example.com/wind', BASE)).toBe('https://example.com/wind');
    expect(safeUrl('http://example.com/wind', BASE)).toBe('http://example.com/wind');
  });

  it('resolves a relative path against the dashboard', () => {
    // `/local/...` links depend on this.
    expect(safeUrl('/local/plan.pdf', BASE)).toBe('https://ha.local:8123/local/plan.pdf');
    expect(safeUrl('../energy', BASE)).toBe('https://ha.local:8123/energy');
  });

  it('refuses javascript:, which is the reason this exists', () => {
    // Card YAML gets copied off forums. This one runs on tap.
    expect(safeUrl('javascript:alert(1)', BASE)).toBeNull();
    expect(safeUrl('JavaScript:alert(1)', BASE)).toBeNull();
    expect(safeUrl('  javascript:alert(1)  ', BASE)).toBeNull();
  });

  it('refuses the other schemes that execute or embed', () => {
    expect(safeUrl('data:text/html,<script>alert(1)</script>', BASE)).toBeNull();
    expect(safeUrl('vbscript:msgbox(1)', BASE)).toBeNull();
    expect(safeUrl('file:///etc/passwd', BASE)).toBeNull();
    expect(safeUrl('blob:https://ha.local:8123/abc', BASE)).toBeNull();
  });

  it('refuses a path it cannot parse rather than passing it through', () => {
    expect(safeUrl('http://', BASE)).toBeNull();
    expect(safeUrl('https://[', BASE)).toBeNull();
  });

  it('resolves an empty path to the dashboard, which the caller never sends', () => {
    // Documented rather than special-cased: performAction returns early on an
    // empty url_path, so this only says what the function does on its own.
    expect(safeUrl('', BASE)).toBe(BASE);
  });

  it('allows a protocol-relative link, which is still https', () => {
    expect(safeUrl('//example.com/wind', BASE)).toBe('https://example.com/wind');
  });

  it('does not treat a scheme-like path segment as a scheme', () => {
    // A relative path that merely contains a colon is still a path.
    expect(safeUrl('/local/notes/javascript:notes.txt', BASE)).toBe(
      'https://ha.local:8123/local/notes/javascript:notes.txt',
    );
  });
});
