/**
 * Types for `release-notes.mjs`, which stays plain JavaScript because CI runs it
 * with bare `node` and compiling a build script to build the build would be one
 * step too many.
 */

/** Markdown for the release page, grouped by conventional commit type. */
export function releaseNotes(from: string, to?: string): string;

/** The version the commits since `from` imply, given the current one. */
export function nextVersion(current: string, from?: string): string;
