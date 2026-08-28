import { describe, expect, it } from 'vitest';
import { playable } from '../src/extract/embed';

describe('playable', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?playsinline=1&autoplay=1&rel=0&start=42', 16 / 9],
    ['https://youtu.be/dQw4w9WgXcQ', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?playsinline=1&autoplay=1&rel=0', 16 / 9],
    ['https://youtube.com/shorts/dQw4w9WgXcQ', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?playsinline=1&autoplay=1&rel=0', 9 / 16],
    ['https://www.instagram.com/reel/DYlectBtCDe/?igsh=abc', 'https://www.instagram.com/reel/DYlectBtCDe/embed/', 9 / 16],
    ['https://www.instagram.com/nasa/p/DcOX3hWFiey/', 'https://www.instagram.com/p/DcOX3hWFiey/embed/', 1],
    ['https://www.tiktok.com/@scout2015/video/6718335390845095173', 'https://www.tiktok.com/player/v1/6718335390845095173?autoplay=1', 9 / 16],
    ['https://vimeo.com/76979871', 'https://player.vimeo.com/video/76979871?autoplay=1&playsinline=1', 16 / 9],
    ['https://x.com/nasa/status/1790000000000000000', 'https://platform.twitter.com/embed/Tweet.html?id=1790000000000000000&dnt=true', 1],
  ])('%s', (url, src, ratio) => expect(playable(url)).toEqual({ kind: 'embed', src, ratio }));

  it('plays media files natively and nothing else', () => {
    expect(playable('https://cdn.example.com/clip.mp4')?.kind).toBe('file');
    expect(playable('https://www.youtube.com/')).toBeNull();
    expect(playable('https://www.instagram.com/nasa/')).toBeNull();
    expect(playable('https://example.com/post')).toBeNull();
    expect(playable(null)).toBeNull();
  });
});
