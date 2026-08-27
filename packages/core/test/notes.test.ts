import { describe, expect, it } from 'vitest';
import { parseMarkdown, parseInline, looksLikeMarkdown, looksTidyable, tidyPlain, markdownToPlain, toggleTodoLine } from '../src/notes/markdown';

describe('parseMarkdown', () => {
  it('splits headings, lists, todos, quotes, rules and paragraphs', () => {
    const b = parseMarkdown('# Groceries\n\n- [ ] milk\n- [x] eggs\n  - bread\n1. first\n> quoted\n---\nplain line\nsame paragraph');
    expect(b.map((x) => x.kind)).toEqual(['heading', 'todo', 'todo', 'bullet', 'number', 'quote', 'rule', 'paragraph']);
    expect((b[1] as { checked: boolean }).checked).toBe(false);
    expect((b[2] as { checked: boolean }).checked).toBe(true);
    expect((b[3] as { depth: number }).depth).toBe(1);
    expect((b[7] as { line: number }).line).toBe(8);
  });
  it('parses inline emphasis, code and links', () => {
    expect(parseInline('a **b** `c` [d](https://e.com) https://f.com _g_').map((i) => i.kind)).toEqual(['text', 'bold', 'text', 'code', 'text', 'link', 'text', 'link', 'text', 'italic']);
  });
});

describe('looksLikeMarkdown / looksTidyable', () => {
  it('detects structure', () => {
    expect(looksLikeMarkdown('just a sentence.')).toBe(false);
    expect(looksLikeMarkdown('- milk\n- eggs')).toBe(true);
    expect(looksLikeMarkdown('some **bold** words')).toBe(true);
  });
  it('offers tidy for plain short lines only', () => {
    expect(looksTidyable('milk\neggs\nbread\nbutter')).toBe(true);
    expect(looksTidyable('- milk\n- eggs\n- bread')).toBe(false);
    expect(looksTidyable('milk\neggs')).toBe(false);
    expect(looksTidyable('This is a long sentence about the weekend.\nAnother full sentence follows it here.\nAnd a third one too.')).toBe(false);
  });
});

describe('tidyPlain', () => {
  it('wraps a grocery list in a title and checkboxes without changing words', () => {
    expect(tidyPlain('Groceries\nmilk\neggs\nbread')).toBe('# Groceries\n\n- [ ] milk\n- [ ] eggs\n- [ ] bread');
  });
  it('turns "label:" lines into sections', () => {
    expect(tidyPlain('fruit:\napples\nveg:\nkale')).toBe('## fruit\n- [ ] apples\n\n## veg\n- [ ] kale');
  });
});

describe('markdownToPlain / toggleTodoLine', () => {
  it('strips markers for the grid', () => {
    expect(markdownToPlain('# T\n- [ ] milk\n- [x] eggs\n- **bold** thing\n---')).toBe('T\n☐ milk\n☑ eggs\n• bold thing');
  });
  it('flips one checkbox', () => {
    expect(toggleTodoLine('- [ ] a\n- [ ] b', 1)).toBe('- [ ] a\n- [x] b');
    expect(toggleTodoLine('- [x] a', 0)).toBe('- [ ] a');
  });
});
