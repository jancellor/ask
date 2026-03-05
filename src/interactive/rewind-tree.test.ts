import { describe, expect, it } from 'vitest';

import { getPrefix } from './rewind-tree.js';

describe('getPrefix', () => {
  const data = [
    { args: [0, 0, 0], expected: '╵ ' },
    { args: [0, 0, 1], expected: '│ ' },
    { args: [0, 1, 0], expected: '├─╴ ' },
    { args: [0, 1, 1], expected: '├─┐ ' },
    { args: [0, 2, 0], expected: '├─┬─╴ ' },
    { args: [0, 2, 1], expected: '├─┬─┐ ' },
    { args: [1, 0, 0], expected: '│ ╵ ' },
    { args: [1, 0, 1], expected: '│ │ ' },
    { args: [1, 1, 0], expected: '│ ├─╴ ' },
    { args: [1, 1, 1], expected: '│ ├─┐ ' },
    { args: [1, 2, 0], expected: '│ ├─┬─╴ ' },
    { args: [1, 2, 1], expected: '│ ├─┬─┐ ' },
    { args: [2, 0, 0], expected: '│ │ ╵ ' },
    { args: [2, 0, 1], expected: '│ │ │ ' },
    { args: [2, 1, 0], expected: '│ │ ├─╴ ' },
    { args: [2, 1, 1], expected: '│ │ ├─┐ ' },
    { args: [2, 2, 0], expected: '│ │ ├─┬─╴ ' },
    { args: [2, 2, 1], expected: '│ │ ├─┬─┐ ' },
  ];
  for (const { args, expected } of data) {
    it(JSON.stringify(args), () => {
      const [a, b, c] = args;
      expect(getPrefix(a, b, c)).toBe(expected);
    });
  }
});
