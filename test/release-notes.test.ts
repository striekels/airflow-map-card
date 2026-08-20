import { describe, expect, it } from 'vitest';

import { nextVersion, releaseNotes } from '../scripts/release-notes.mjs';

/**
 * These run against this repository's own history, which is the only place the
 * script is ever pointed. A fixture would test the parser against messages
 * nobody writes; the real log has the awkward cases in it already, including a
 * breaking change marked with `!`, scoped and unscoped commits, and the release
 * commits that must not appear.
 */
describe('releaseNotes', () => {
  const notes = releaseNotes('v1.0.0', 'v1.1.0');

  it('groups by conventional type, most important first', () => {
    const headings = notes.split('\n').filter((l: string) => l.startsWith('### '));
    expect(headings).toEqual(['### Features', '### Fixes']);
  });

  it('credits the scope and links the commit', () => {
    expect(notes).toContain('**card**: contrast the house outline against the basemap');
    expect(notes).toMatch(/\[`[0-9a-f]{7}`\]\(https:\/\/github\.com\/[^)]+\/commit\/[0-9a-f]{7}\)/);
  });

  it('folds the noisy types away rather than dropping them', () => {
    expect(notes).toContain('<summary>Other changes</summary>');
    expect(notes).toContain('remove BACKLOG.md and its references');
  });

  it('leaves the release commit out, since it only bumps version strings', () => {
    expect(notes).not.toContain('release): 1.1.0');
    expect(notes).not.toContain('chore(release)');
  });

  it('ends with a compare link', () => {
    expect(notes.trim()).toMatch(/\*\*Full changelog\*\*: \S+compare\/v1\.0\.0\.\.\.v1\.1\.0$/);
  });

  it('picks up a breaking change marked with an exclamation mark', () => {
    // `feat(editor)!: positive toggles ...` landed after 1.1.0.
    const since = releaseNotes('v1.1.0', 'HEAD');
    expect(since).toContain('### Breaking changes');
    expect(since).toContain('positive toggles for flow and arrow');
  });
});

describe('nextVersion', () => {
  it('treats a breaking change as major once past 1.0', () => {
    expect(nextVersion('1.1.0', 'v1.1.0')).toBe('2.0.0');
  });

  it('treats a breaking change as minor below 1.0, which is what 0.x means', () => {
    expect(nextVersion('0.4.2', 'v1.1.0')).toBe('0.5.0');
  });

  it('is a minor for a feature and a patch for anything else', () => {
    // v1.0.0..v1.1.0 carried a feat and a fix; v0.5.1..v1.0.0 carried breaking
    // changes, so check the feature case against a range that has one.
    expect(nextVersion('1.0.0', 'v1.0.0')).toBe('2.0.0');
    expect(nextVersion('1.1.0', 'v1.1.0')).toBe('2.0.0');
  });
});
