export class PromiseTimeoutError extends Error {
  public static wrap<T>(timeout: number, promise: PromiseLike<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (timeout >= 0) {
        setTimeout(() => reject(new PromiseTimeoutError(timeout)), timeout);
      }
      promise.then(resolve, reject);
    });
  }

  private constructor(timeout: number) {
    super(`Promise timed out after ${timeout}ms`);
  }
}
