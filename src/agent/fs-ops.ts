export function isEnoentError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  return 'code' in error && error.code === 'ENOENT';
}

export async function ignoreMissing<T>(
  op: () => Promise<T>,
): Promise<T | undefined> {
  try {
    return await op();
  } catch (error: unknown) {
    if (!isEnoentError(error)) throw error;
  }
}
