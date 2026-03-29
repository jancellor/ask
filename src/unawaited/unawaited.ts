// rename logRejected, rename module and dir too?
// for when you want "don't wait but don't ignore"
export function unawaited(promise: Promise<unknown>): void {
  promise.catch(logError);
}

// for when you want "await but ignore"
export function ignoreRejected<T>(promise: Promise<T>): Promise<void> {
  return promise.then(ignore, ignore);
}

// for when you want "await but log now"
export function logRejected<T>(promise: Promise<T>): Promise<void> {
  return promise.then(ignore, logError);
}

export function logError(err: unknown): void {
  console.error(String(err));
}

function ignore() {}
