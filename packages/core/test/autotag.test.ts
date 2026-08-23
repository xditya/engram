import { describe, expect, it } from 'vitest';
import { autotagText, matchTags } from '../src/db/autotag';

describe('autotag', () => {
  const tags = ['design', 'design/typography', 'react native', 'ai', 'recipes', 'Go'];
  it('matches whole words case-insensitively, including multi-word and hierarchical tags', () => {
    const got = matchTags('A guide to Typography in React-Native apps for designers', tags);
    expect(got).toEqual(['design/typography', 'react native']);
  });
  it('skips short tags and substrings', () => {
    expect(matchTags('Going to redesign the AI pipeline', tags)).toEqual([]);
    expect(matchTags('Going to redesign the ai pipeline', ['ai'])).toEqual([]);
  });
  it('builds the haystack from title, body, ocr, url and domain', () => {
    const text = autotagText({ title: 'T', body: 'B', ocr_text: 'O', url: 'https://x.com/recipes/1', domain: 'x.com', summary: null });
    expect(matchTags(text, ['recipes', 'x.com'])).toEqual(['recipes', 'x.com']);
  });
});
