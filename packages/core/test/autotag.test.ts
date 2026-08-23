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

import { extractKeywords, siteTag } from '../src/db/keywords';
describe('keywords', () => {
  it('prefers proper nouns from the title and repeated body terms, skipping stopwords', () => {
    const body = 'The memex is a device. Bush described the memex as a desk. Hypertext grew from the memex idea; hypertext links.';
    expect(extractKeywords('Memex - Wikipedia', body)).toEqual(['memex', 'wikipedia', 'hypertext']);
  });
  it('returns nothing for tiny noise', () => {
    expect(extractKeywords('ok', 'the and of')).toEqual([]);
  });
  it('derives a site tag', () => {
    expect(siteTag('en.wikipedia.org')).toBe('wikipedia');
    expect(siteTag('www.bbc.co.uk')).toBe('bbc');
    expect(siteTag('github.com')).toBe('github');
    expect(siteTag('10.0.0.1')).toBeNull();
  });
});
