#!/usr/bin/env node
// Release notes from conventional commits: everything since the previous release tag, grouped so a user can tell
// what changed without reading commit hashes. Usage: node scripts/changelog.mjs <tag> [previousTag] > notes.md
// Reads the bullet bodies commits carry ("- one change per line") and drops the internal noise (ci, chore, test).
import { execSync } from 'node:child_process';

const sh = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim();
const tag = process.argv[2] ?? 'unreleased';
let prev = process.argv[3];
if (!prev) {
  // Previous release = the newest tag that is an ancestor of HEAD, other than the tag being cut.
  const tags = sh('git tag --sort=-creatordate --merged HEAD').split('\n').filter((t) => t && t !== tag);
  prev = tags[0] ?? '';
}
const range = prev ? `${prev}..HEAD` : 'HEAD';
const raw = sh(`git log ${range} --no-merges --format=%H%x1f%s%x1f%b%x1e`);

const SECTIONS = [
  { types: ['feat'], title: 'New' },
  { types: ['fix'], title: 'Fixed' },
  { types: ['perf'], title: 'Faster' },
  { types: ['refactor', 'style', 'docs', 'build', 'revert'], title: 'Also' },
];
const HIDE = new Set(['ci', 'chore', 'test']);
const SCOPE_LABEL = { mobile: 'App', core: 'Core', ios: 'iOS', android: 'Android', website: 'Website', sync: 'Sync', ci: 'CI' };

const commits = raw.split('\x1e').map((c) => c.trim()).filter(Boolean).map((c) => {
  const [hash, subject, body = ''] = c.split('\x1f');
  const m = /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/.exec(subject);
  return { hash, type: m?.[1] ?? 'other', scope: m?.[2], breaking: !!m?.[3] || /BREAKING CHANGE/.test(body), subject: (m?.[4] ?? subject).trim(), body };
});

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const bullets = (body) => body.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('- ')).map((l) => l.slice(2).trim());

const out = [];
if (prev) out.push(`Changes since ${prev}.`); else out.push('First release.');
out.push('');

const breaking = commits.filter((c) => c.breaking);
if (breaking.length) {
  out.push('### Breaking');
  for (const c of breaking) out.push(`- ${cap(c.subject)}`);
  out.push('');
}

for (const s of SECTIONS) {
  const list = commits.filter((c) => s.types.includes(c.type) && !c.breaking);
  if (!list.length) continue;
  out.push(`### ${s.title}`);
  for (const c of list) {
    const label = c.scope && SCOPE_LABEL[c.scope] ? `**${SCOPE_LABEL[c.scope]}:** ` : '';
    out.push(`- ${label}${cap(c.subject)}`);
    for (const b of bullets(c.body).slice(0, 6)) out.push(`  - ${cap(b)}`);
  }
  out.push('');
}

const other = commits.filter((c) => !c.breaking && !HIDE.has(c.type) && !SECTIONS.some((s) => s.types.includes(c.type)));
if (other.length) {
  out.push('### Other');
  for (const c of other) out.push(`- ${cap(c.subject)}`);
  out.push('');
}

const hidden = commits.filter((c) => HIDE.has(c.type)).length;
if (hidden) out.push(`_${hidden} housekeeping commit${hidden === 1 ? '' : 's'} not listed._`, '');

process.stdout.write(out.join('\n'));
