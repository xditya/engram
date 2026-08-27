// A small markdown subset for notes: enough for lists, checklists, headings and emphasis, nothing that needs a
// real parser. The renderer lives in the app; this file decides structure and stays testable.

export type Inline = { kind: 'text' | 'bold' | 'italic' | 'code'; text: string } | { kind: 'link'; text: string; href: string };
export type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; inline: Inline[]; line: number }
  | { kind: 'paragraph'; inline: Inline[]; line: number }
  | { kind: 'bullet'; inline: Inline[]; line: number; depth: number }
  | { kind: 'number'; n: number; inline: Inline[]; line: number; depth: number }
  | { kind: 'todo'; checked: boolean; inline: Inline[]; line: number; depth: number }
  | { kind: 'quote'; inline: Inline[]; line: number }
  | { kind: 'rule'; line: number };

const TODO = /^(\s*)[-*]\s+\[([ xX])\]\s+(.*)$/;
const BULLET = /^(\s*)[-*]\s+(.*)$/;
const NUMBER = /^(\s*)(\d+)[.)]\s+(.*)$/;
const HEADING = /^(#{1,3})\s+(.*)$/;

export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  const re = /(\*\*(.+?)\*\*|__(.+?)__|`([^`]+)`|\[([^\]]+)\]\((https?:[^)\s]+)\)|(https?:\/\/[^\s<>)]+)|\*(?!\s)(.+?)(?<!\s)\*|_(?!\s)(.+?)(?<!\s)_)/g;
  let last = 0;
  for (const m of s.matchAll(re)) {
    if (m.index! > last) out.push({ kind: 'text', text: s.slice(last, m.index) });
    if (m[2] ?? m[3]) out.push({ kind: 'bold', text: (m[2] ?? m[3])! });
    else if (m[4]) out.push({ kind: 'code', text: m[4] });
    else if (m[5]) out.push({ kind: 'link', text: m[5], href: m[6]! });
    else if (m[7]) out.push({ kind: 'link', text: m[7], href: m[7] });
    else out.push({ kind: 'italic', text: (m[8] ?? m[9])! });
    last = m.index! + m[0].length;
  }
  if (last < s.length) out.push({ kind: 'text', text: s.slice(last) });
  return out;
}

export function parseMarkdown(text: string): Block[] {
  const blocks: Block[] = [];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let para: { start: number; lines: string[] } | null = null;
  const flush = () => { if (para) { blocks.push({ kind: 'paragraph', inline: parseInline(para.lines.join(' ')), line: para.start }); para = null; } };
  lines.forEach((raw, i) => {
    const line = raw.replace(/\s+$/, '');
    let m: RegExpExecArray | null;
    if (!line.trim()) { flush(); return; }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) { flush(); blocks.push({ kind: 'rule', line: i }); return; }
    if ((m = HEADING.exec(line))) { flush(); blocks.push({ kind: 'heading', level: m[1]!.length as 1 | 2 | 3, inline: parseInline(m[2]!), line: i }); return; }
    if ((m = TODO.exec(line))) { flush(); blocks.push({ kind: 'todo', checked: m[2] !== ' ', inline: parseInline(m[3]!), line: i, depth: Math.floor(m[1]!.length / 2) }); return; }
    if ((m = BULLET.exec(line))) { flush(); blocks.push({ kind: 'bullet', inline: parseInline(m[2]!), line: i, depth: Math.floor(m[1]!.length / 2) }); return; }
    if ((m = NUMBER.exec(line))) { flush(); blocks.push({ kind: 'number', n: Number(m[2]), inline: parseInline(m[3]!), line: i, depth: Math.floor(m[1]!.length / 2) }); return; }
    if (line.startsWith('>')) { flush(); blocks.push({ kind: 'quote', inline: parseInline(line.replace(/^>\s?/, '')), line: i }); return; }
    if (para) para.lines.push(line); else para = { start: i, lines: [line] };
  });
  flush();
  return blocks;
}

// Structure worth rendering: a heading, a list, a checkbox, emphasis or a rule somewhere in the text.
export function looksLikeMarkdown(text: string): boolean {
  return parseMarkdown(text).some((b) => b.kind !== 'paragraph') || /\*\*.+\*\*|`[^`]+`|\[[^\]]+\]\(https?:/.test(text);
}

// Plain lines that read as a list: three or more short lines, none of them sentences, no markdown yet.
export function looksTidyable(text: string): boolean {
  if (looksLikeMarkdown(text)) return false;
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 3) return false;
  const short = lines.filter((l) => l.length <= 60 && !/[.!?]$/.test(l) && l.split(/\s+/).length <= 8);
  return short.length >= Math.ceil(lines.length * 0.7);
}

// Deterministic tidy: an optional title line, then one checkbox per line. Blank lines split sections; a line
// ending in ":" becomes a section heading. Content is never changed, only wrapped.
export function tidyPlain(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map((l) => l.trim());
  const out: string[] = [];
  const items = lines.filter(Boolean);
  const titleFirst = items.length >= 3 && items[0]!.length <= 40 && !/[.!?,:]$/.test(items[0]!) && items[0]!.split(/\s+/).length <= 5 && !/\d/.test(items[0]!);
  let first = true;
  for (const l of lines) {
    if (!l) { if (out.length && out[out.length - 1] !== '') out.push(''); continue; }
    if (first && titleFirst) { out.push(`# ${l}`, ''); first = false; continue; }
    first = false;
    if (/:$/.test(l) && l.length <= 40) { if (out.length && out[out.length - 1] !== '') out.push(''); out.push(`## ${l.slice(0, -1)}`); continue; }
    out.push(`- [ ] ${l.replace(/^[-*•]\s*/, '')}`);
  }
  return out.join('\n').trim();
}

export const TIDY_SYSTEM = [
  'You reformat a personal note as Markdown. Keep every word of content; do not add, remove, reorder or correct anything.',
  'Use: a # title only if the first line is clearly one; ## for section labels; "- [ ] " checkboxes for things to buy, do or pack; "- " bullets otherwise; numbered lists only where order matters.',
  'Return the Markdown only, no code fence, no commentary.',
].join('\n');

// Grid cards and search snippets: the text without markers, checkboxes as glyphs.
export function markdownToPlain(text: string): string {
  return text.replace(/\r\n?/g, '\n').split('\n').map((l) => l
    .replace(/^(\s*)[-*]\s+\[([ xX])\]\s+/, (_, sp: string, c: string) => `${sp}${c === ' ' ? '☐' : '☑'} `)
    .replace(/^(\s*)[-*]\s+/, '$1• ')
    .replace(/^#{1,3}\s+/, '')
    .replace(/^>\s?/, '')
    .replace(/\*\*(.+?)\*\*|__(.+?)__/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\(https?:[^)]+\)/g, '$1'))
    .filter((l, i, a) => !(/^(-{3,}|\*{3,})$/.test(l.trim()))).join('\n');
}

// Flip the checkbox on a given source line; other lines untouched.
export function toggleTodoLine(text: string, line: number): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  if (lines[line] == null) return text;
  lines[line] = lines[line]!.replace(/^(\s*[-*]\s+\[)([ xX])(\])/, (_, a: string, s: string, b: string) => `${a}${s === ' ' ? 'x' : ' '}${b}`);
  return lines.join('\n');
}
