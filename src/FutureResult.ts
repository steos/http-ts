import { Result, Failure } from "./Results";

export default class FutureResult<L, R> {
  private constructor(private effect: () => Promise<Result<L, R>>) {}

  static of<L, R>(f: () => Promise<Result<L, R>>) {
    return new FutureResult(f);
  }

  chain<T>(f: (x: R) => FutureResult<L, T>): FutureResult<L, T> {
    return new FutureResult(async (): Promise<Result<L, T>> => {
      const result = await this.run();
      if (result.isFailure) return Failure(result.failure);
      const next = f(result.success);
      return await next.run();
    });
  }

  async fold<T>(f: (x: L) => T, g: (x: R) => T): Promise<T> {
    const result = await this.run();
    return result.fold(f, g);
  }

  map<T>(f: (x: R) => T): FutureResult<L, T> {
    return FutureResult.of(async () => {
      const result = await this.run();
      return result.map(f);
    });
  }

  mapFailure<T>(f: (x: L) => T): FutureResult<T, R> {
    return FutureResult.of(async () => {
      const result = await this.run();
      return result.mapFailure(f);
    });
  }

  run(): Promise<Result<L, R>> {
    return this.effect();
  }
}
