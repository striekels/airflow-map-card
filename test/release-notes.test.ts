import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { nextVersion, releaseNotes } from '../scripts/release-notes.mjs';

/**
 * The generator reads git, so the tests give it a git repository to read: a few
 * empty commits built here, in a temporary directory.
 *
 * Pointing it at this project's own log was the first attempt and it broke CI,
 * which checks out shallow and without tags. Reading real history also means
 * the suite cannot run on a fresh clone, and every assertion is hostage to
 * commits nobody has written yet. Eight lines of setup buys a fixture that
 * holds every awkward case on purpose: a breaking `!`, scoped and unscoped
 * subjects, a type that belongs in the fold, a release commit that must not
 * appear, and a line that is not a conventional commit at all.
 */
let repo: string;

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
}

function commit(subject: string, body = ''): void {
  git('commit', '--allow-empty', '-m', subject, ...(body ? ['-m', body] : []));
}

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'release-notes-'));
  git('init', '--initial-branch=main');
  // Local config, so the suite neither reads nor needs the machine's identity,
  // and signing stays off however the developer has configured it globally.
  git('config', 'user.name', 'Test');
  git('config', 'user.email', 'test@example.com');
  git('config', 'commit.gpgsign', 'false');

  commit('feat: the first release');
  git('tag', 'v1.0.0');

  commit('feat(card): draw the house outline');
  commit('fix(card): contrast the outline against the basemap');
  commit('docs: rewrite the readme');
  commit('Merge branch is not a conventional commit');
  commit('chore(release): 1.1.0');
  git('tag', 'v1.1.0');

  commit('feat(editor)!: positive toggles for flow and arrow');
  commit('perf: seed fewer particles in light wind');
  commit('fix: respawn particles away from the edge', 'BREAKING CHANGE: flow.hide is gone.');
  commit('chore(release): 2.0.0');
  git('tag', 'v2.0.0');

  // A tail with no breaking change in it, because nextVersion always ranges to
  // HEAD: the feature and housekeeping cases are unreachable from a tip that
  // has one.
  commit('feat(map): remember the zoom level');
  git('tag', 'v2.1.0');

  commit('docs: tidy the readme');
  commit('feat(dev): a harness nobody installs');
  // Describes the footer without being one. A substring search called this a
  // breaking change and put it at the top of the release page.
  commit('fix: parse the BREAKING CHANGE footer', 'Mentions BREAKING CHANGE in prose.');
});

afterAll(() => rmSync(repo, { recursive: true, force: true }));

describe('releaseNotes', () => {
  it('groups by conventional type, most important first', () => {
    const headings = releaseNotes('v1.0.0', 'v1.1.0', { cwd: repo })
      .split('\n')
      .filter((l) => l.startsWith('### '));
    expect(headings).toEqual(['### Features', '### Fixes']);
  });

  it('credits the scope and links the commit', () => {
    const notes = releaseNotes('v1.0.0', 'v1.1.0', { cwd: repo });
    expect(notes).toContain('**card**: contrast the outline against the basemap');
    expect(notes).toMatch(/\[`[0-9a-f]{7}`\]\(https:\/\/github\.com\/[^)]+\/commit\/[0-9a-f]{7}\)/);
  });

  it('folds the noisy types away rather than dropping them', () => {
    const notes = releaseNotes('v1.0.0', 'v1.1.0', { cwd: repo });
    expect(notes).toContain('<summary>Other changes</summary>');
    expect(notes).toContain('rewrite the readme');
  });

  it('leaves the release commit out, since it only bumps version strings', () => {
    expect(releaseNotes('v1.0.0', 'v1.1.0', { cwd: repo })).not.toContain('chore(release)');
  });

  it('skips a subject that is not a conventional commit', () => {
    expect(releaseNotes('v1.0.0', 'v1.1.0', { cwd: repo })).not.toContain('Merge branch');
  });

  it('ends with a compare link', () => {
    const notes = releaseNotes('v1.0.0', 'v1.1.0', { cwd: repo });
    expect(notes.trim()).toMatch(/\*\*Full changelog\*\*: \S+compare\/v1\.0\.0\.\.\.v1\.1\.0$/);
  });

  it('reads a breaking change from an exclamation mark or a footer', () => {
    const notes = releaseNotes('v1.1.0', 'v2.0.0', { cwd: repo });
    expect(notes).toContain('### Breaking changes');
    expect(notes).toContain('positive toggles for flow and arrow');
    // Promoted out of Fixes by its footer, so it cannot be missed.
    expect(notes).toContain('respawn particles away from the edge');
    expect(notes.split('### Fixes')).toHaveLength(1);
  });

  it('reads BREAKING CHANGE as a footer, not as a phrase in the prose', () => {
    const notes = releaseNotes('v2.1.0', 'HEAD', { cwd: repo });
    expect(notes).toContain('### Fixes');
    expect(notes).not.toContain('### Breaking changes');
  });

  it('folds a dev-scoped feature away, since it is not in what people install', () => {
    const notes = releaseNotes('v2.1.0', 'HEAD', { cwd: repo });
    expect(notes).toContain('a harness nobody installs');
    expect(notes).toContain('<summary>Other changes</summary>');
    expect(notes).not.toContain('### Features');
  });

  it('keeps a section out when nothing in the range belongs to it', () => {
    expect(releaseNotes('v1.0.0', 'v1.1.0', { cwd: repo })).not.toContain('### Performance');
  });
});

describe('nextVersion', () => {
  it('treats a breaking change as major once past 1.0', () => {
    expect(nextVersion('1.1.0', 'v1.1.0', { cwd: repo })).toBe('2.0.0');
  });

  it('treats a breaking change as minor below 1.0, which is what 0.x means', () => {
    expect(nextVersion('0.4.2', 'v1.1.0', { cwd: repo })).toBe('0.5.0');
  });

  it('is a minor for a feature', () => {
    expect(nextVersion('2.0.0', 'v2.0.0', { cwd: repo })).toBe('2.1.0');
  });

  it('is a patch for a fix, and is not fooled by prose in the body', () => {
    expect(nextVersion('2.1.0', 'v2.1.0', { cwd: repo })).toBe('2.1.1');
  });

  it('does not bump a minor for a change that is not in the bundle', () => {
    // The range holds a feat(dev). A minor release whose Features section is
    // empty, because the only feature was folded away, would puzzle anyone
    // reading it.
    expect(releaseNotes('v2.1.0', 'HEAD', { cwd: repo })).not.toContain('### Features');
    expect(nextVersion('2.1.0', 'v2.1.0', { cwd: repo })).toBe('2.1.1');
  });
});
