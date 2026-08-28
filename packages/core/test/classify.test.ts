import { describe, expect, it } from 'vitest';
import { cleanTags } from '../src/ai/jobs/classify';

describe('cleanTags', () => {
  it('drops function words, contractions, numbers and the site name, keeps real topics', () => {
    expect(cleanTags(['after', "it's", 'you’re', 'every', '2014', 'Fermi Paradox', '#space', 'science', 'the best', 'starry-nights', 'a', 'civilizations']))
      .toEqual(['fermi paradox', 'space', 'science', 'starry-nights', 'civilizations']);
  });
});
