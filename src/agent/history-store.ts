import {
  appendFile,
  mkdir,
  readFile,
  rename,
  writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { ignoreMissing } from './fs-ops.js';

const HISTORY_PATH = join(homedir(), '.ask', 'history.jsonl');
const HISTORY_DIR = join(homedir(), '.ask');
const MAX_ENTRIES = 1000;
const TRIM_THRESHOLD = 2000;

export async function loadHistory(): Promise<string[]> {
  const raw =
    (await ignoreMissing(() => readFile(HISTORY_PATH, 'utf-8'))) ?? '';
  const lines = raw.split('\n').filter((line) => line.length > 0);

  const rawCount = lines.length;

  // Deduplicate consecutive identical entries
  const deduped: string[] = [];
  for (const line of lines) {
    let entry: unknown;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof entry !== 'string') continue;
    if (deduped.length === 0 || deduped[deduped.length - 1] !== entry) {
      deduped.push(entry);
    }
  }

  const trimmed = deduped.slice(-MAX_ENTRIES);

  if (rawCount > TRIM_THRESHOLD) {
    const tmp = HISTORY_PATH + '.tmp';
    void writeFile(
      tmp,
      trimmed.map((e) => JSON.stringify(e) + '\n').join(''),
      'utf-8',
    ).then(() => rename(tmp, HISTORY_PATH));
  }

  return trimmed;
}

export async function appendHistory(entry: string): Promise<void> {
  await mkdir(HISTORY_DIR, { recursive: true });
  await appendFile(HISTORY_PATH, JSON.stringify(entry) + '\n', 'utf-8');
}
