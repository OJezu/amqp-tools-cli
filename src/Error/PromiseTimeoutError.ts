export class PromiseTimeoutError extends Error {
  public static wrap<T>(timeout: number, promise: PromiseLike<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const wrappedPromise = Promise.resolve(promise).then(resolve, reject);

      if (timeout >= 0) {
        const timeoutReference = setTimeout(() => reject(new PromiseTimeoutError(timeout)), timeout);
        wrappedPromise.finally(() => {
          clearTimeout(timeoutReference);
        });
      }
    });
  }

  private constructor(timeout: number) {
    super(`Promise timed out after ${timeout}ms`);
  }
}
