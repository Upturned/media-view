import { describe, expect, it } from 'vitest';
import { pathDiff, type PathPart } from '../src/health.ts';

const text = (p: PathPart) => p.pre + p.hit + p.post;

describe('pathDiff', () => {
  it('highlights a renamed folder', () => {
    const [was, now] = pathDiff('Images\\Art\\Elves', 'Images\\Arte\\Elves');
    expect(was).toEqual({ pre: 'Images\\', hit: 'Art', post: '\\Elves' });
    expect(now).toEqual({ pre: 'Images\\', hit: 'Arte', post: '\\Elves' });
  });

  it('keeps the separator on the side where a folder was only added', () => {
    const [was, now] = pathDiff('Images\\Humor\\Memes', 'Images\\Humor\\Funny\\Memes');
    expect(text(was)).toBe('Images\\Humor\\Memes');
    expect(was.hit).toBe('');
    expect(now).toEqual({ pre: 'Images\\Humor\\', hit: 'Funny', post: '\\Memes' });
  });

  it('keeps the separator on the side where a folder was only removed', () => {
    const [was, now] = pathDiff('Images\\Games\\Screenshots\\Dead cells\\problem', 'Images\\Games\\Screenshots\\problem');
    expect(was).toEqual({ pre: 'Images\\Games\\Screenshots\\', hit: 'Dead cells', post: '\\problem' });
    expect(text(now)).toBe('Images\\Games\\Screenshots\\problem');
  });

  it('handles a change at the end, and identical paths', () => {
    const [was, now] = pathDiff('Images\\A\\B', 'Images\\A\\C');
    expect([text(was), text(now)]).toEqual(['Images\\A\\B', 'Images\\A\\C']);
    expect(now.hit).toBe('C');
    const [same] = pathDiff('Images\\A', 'Images\\A');
    expect(same).toEqual({ pre: 'Images\\A', hit: '', post: '' });
  });
});
