export function unawaited(promise: Promise<unknown>): void {
  promise.catch((err) => console.error(String(err)));
}
