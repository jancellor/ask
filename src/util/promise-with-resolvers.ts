export type PromiseWithResolvers<T> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

export function promiseWithResolvers<T>(): PromiseWithResolvers<T> {
  let resolve!: PromiseWithResolvers<T>['resolve'];
  let reject!: PromiseWithResolvers<T>['reject'];
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
