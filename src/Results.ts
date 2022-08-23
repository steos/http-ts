interface ResultInterface<L, R> {
  chain<T>(f: (x: R) => Result<L, T>): Result<L, T>;
  map<T>(f: (x: R) => T): Result<L, T>;
  orElse<T>(f: (x: L) => Result<T, R>): Result<T, R>;
  get(x: R): R;
  fold<T>(f: (x: L) => T, g: (x: R) => T): T;
  mapFailure<T>(f: (x: L) => T): Result<T, R>;
}

interface Success<L, R> extends ResultInterface<L, R> {
  readonly isSuccess: true;
  readonly isFailure: false;
  readonly success: R;
}

interface Failure<L, R> extends ResultInterface<L, R> {
  readonly isSuccess: false;
  readonly isFailure: true;
  readonly failure: L;
}

export type Result<L, R> = Success<L, R> | Failure<L, R>;

export const Success = <R>(x: R): Result<never, R> => ({
  success: x,
  isFailure: false,
  isSuccess: true,
  chain: (f) => f(x),
  map: (f) => Success(f(x)),
  orElse: () => Success(x),
  get: () => x,
  fold: (f, g) => g(x),
  mapFailure: () => Success(x),
});

export const Failure = <L>(x: L): Result<L, never> => ({
  failure: x,
  isFailure: true,
  isSuccess: false,
  chain: () => Failure(x),
  map: () => Failure(x),
  orElse: (f) => f(x),
  get: (x) => x,
  fold: (f, g) => f(x),
  mapFailure: (f) => Failure(f(x)),
});

const fromNullable = <T>(x: T | null | undefined): Result<null, T> =>
  x == null ? Failure(null) : Success(x);

export default { fromNullable };
