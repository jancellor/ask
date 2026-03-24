export function isEnoentError(error: unknown): boolean {
  return hasErrorCode(error, 'ENOENT');
}

export function isEexistError(error: unknown): boolean {
  return hasErrorCode(error, 'EEXIST');
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

function hasErrorCode(error: unknown, code: string): boolean {
  if (!error || typeof error !== 'object') return false;
  return 'code' in error && error.code === code;
}
