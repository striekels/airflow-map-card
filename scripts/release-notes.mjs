/**
 * Build release notes from conventional commit messages.
 *
 * Written rather than pulled in: git-cliff is a Rust binary and the npm
 * generators bring a dependency tree apiece, for output this project wants to
 * control the shape of anyway. Sixty lines and no supply chain.
 *
 *   node scripts/release-notes.mjs            notes since the previous tag
 *   node scripts/release-notes.mjs v1.0.0     notes since a given ref
 *
 * The body of a commit is deliberately not included. A release note answers
 * "what changed"; the reasoning belongs in the commit, where it sits next to
 * the diff it explains, and `git log` is a better reader for it than a release
 * page.
 */
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const REPO = 'https://github.com/striekels/airflow-map-card';

/** Conventional types, in the order a reader cares about them. */
const SECTIONS = [
  { key: 'breaking', title: '### Breaking changes' },
  { key: 'feat', title: '### Features' },
  { key: 'fix', title: '### Fixes' },
  { key: 'perf', title: '### Performance' },
];

/** Everything else, folded away. Real changes, rarely the reason to upgrade. */
const QUIET = ['refactor', 'docs', 'test', 'build', 'ci', 'chore', 'style'];

// `cwd` exists so the tests can point this at a repository they built
// themselves. Reading the real log would tie them to a full clone with tags,
// which CI does not make and a history rewrite would invalidate.
function git(cwd, ...args) {
  return execFileSync('git', args, { encoding: 'utf8', cwd }).trim();
}

function previousTag(cwd) {
  try {
    return git(cwd, 'describe', '--tags', '--abbrev=0', 'HEAD^');
  } catch {
    return '';
  }
}

// Anchored to the start of a line and requiring the colon, because the
// conventional commits spec makes this a footer token rather than a phrase. A
// substring search read a commit that merely described the footer in prose as
// a breaking change, and put a test fix at the top of the release page.
const BREAKING_FOOTER = /^BREAKING[ -]CHANGE:/m;

/** `type(scope)!: subject`, plus a body scanned for a breaking-change footer. */
function parse(entry) {
  const [sha, subject, ...bodyLines] = entry.split('\n');
  const match = /^(?<type>[a-z]+)(?:\((?<scope>[^)]+)\))?(?<bang>!)?:\s*(?<rest>.+)$/.exec(subject);
  if (!match) return null;

  const { type, scope, bang, rest } = match.groups;
  const breaking = Boolean(bang) || BREAKING_FOOTER.test(bodyLines.join('\n'));
  return { sha, type, scope, subject: rest, breaking };
}

function line({ sha, scope, subject }) {
  const where = scope ? `**${scope}**: ` : '';
  return `- ${where}${subject} ([\`${sha}\`](${REPO}/commit/${sha}))`;
}

/** Every commit in the range, newest first, minus the release bookkeeping. */
function commitsIn(range, cwd) {
  return git(cwd, 'log', range, '--no-merges', '--format=%h%n%s%n%b%x00')
    .split('\0')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map(parse)
    // The release commit itself is bookkeeping: it bumps three version strings
    // and says so. Nobody reads release notes to learn that a release happened.
    .filter((c) => c && !(c.type === 'chore' && c.scope === 'release'));
}

export function releaseNotes(from, to = 'HEAD', { cwd } = {}) {
  const commits = commitsIn(from ? `${from}..${to}` : to, cwd);
  const out = [];

  for (const section of SECTIONS) {
    const matching = commits.filter((c) =>
      section.key === 'breaking' ? c.breaking : c.type === section.key && !c.breaking,
    );
    if (matching.length === 0) continue;
    out.push(section.title, '', ...matching.map(line), '');
  }

  const quiet = commits.filter((c) => !c.breaking && QUIET.includes(c.type));
  if (quiet.length > 0) {
    out.push(
      '<details>',
      '<summary>Other changes</summary>',
      '',
      ...quiet.map(line),
      '',
      '</details>',
      '',
    );
  }

  if (from) out.push(`**Full changelog**: ${REPO}/compare/${from}...${to}`);
  return out.join('\n').trim();
}

/**
 * The version these commits imply: a breaking change is major, a feature is
 * minor, anything else is a patch. Pre-1.0 a breaking change is only a minor,
 * which is what the 0.x contract means.
 */
export function nextVersion(current, from, { cwd } = {}) {
  const commits = commitsIn(from ? `${from}..HEAD` : 'HEAD', cwd);

  const [major, minor, patch] = current.split('.').map(Number);
  if (commits.some((c) => c.breaking)) {
    return major === 0 ? `0.${minor + 1}.0` : `${major + 1}.0.0`;
  }
  if (commits.some((c) => c.type === 'feat')) return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

// pathToFileURL rather than string building: on Windows the two forms differ by
// a slash, so a hand-built comparison never matches and the script prints
// nothing at all.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const from = process.argv[2] ?? previousTag();
  // The release workflow passes the tag it is building. Left as HEAD, the
  // compare link on a published release page points at a moving target.
  const to = process.argv[3] ?? 'HEAD';
  process.stdout.write(releaseNotes(from, to) + '\n');
}
