import { join, parse, sep } from 'path';

export function ancestorPaths(dir: string): string[] {
  const { root } = parse(dir);
  const parts = dir.slice(root.length).split(sep).filter(Boolean);
  return Array.from({ length: parts.length + 1 }, (_, i) =>
    join(root, ...parts.slice(0, i)),
  );
}
