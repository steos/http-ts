import * as http from "http";
import * as t from "io-ts";
import { PathReporter } from "io-ts/lib/PathReporter";
import { StringDecoder } from "string_decoder";
import FutureResult from "./FutureResult";
import { Failure, Result, Success } from "./Results";

export type Body = string | AsyncIterable<unknown>;

export type Headers = Record<string, string | string[] | undefined>;

export interface Request {
  readonly headers: Headers;
  readonly url: string;
  readonly body: Body;
  readonly method: string;
}

export const readBody = async (
  body: Body,
  encoding: BufferEncoding = "utf8"
): Promise<string> => {
  if (typeof body === "string") return body;
  let str = "";
  const decoder = new StringDecoder(encoding);
  for await (let chunk of body) {
    if (typeof chunk === "string") {
      str += chunk;
    } else if (chunk instanceof Buffer) {
      str += decoder.write(chunk);
    }
  }
  str += decoder.end();
  return str;
};

export type RequestHandler = () => LazyPromise<Response>;

export type ServerResponseInterface = {
  write(chunk: unknown): void;
  writeHead(status: number, headers: Headers): void;
  end(): void;
};

export const sendResponse = async (
  response: Response,
  res: ServerResponseInterface
) => {
  res.writeHead(response.status, response.headers);
  if (response.body) {
    if (typeof response.body === "string") {
      res.write(response.body);
    } else {
      for await (const chunk of response.body) {
        res.write(chunk);
      }
    }
  }
  res.end();
};

export type Resource = {
  contentType: string;
  methods: Record<string, RequestHandler>;
};

type ResourceProps = { contentType?: string } & {
  [k: string]: RequestHandler;
};

export const resource = ({
  contentType = "application/json",
  ...methods
}: ResourceProps): Resource => ({
  contentType,
  methods,
});

export class Response {
  readonly status: number;
  readonly headers: Headers;
  readonly body?: Body;
  readonly message: string;
  private constructor(
    status: number,
    msg: string,
    headers: Headers,
    body?: Body
  ) {
    this.status = status;
    this.headers = headers;
    this.body = body;
    this.message = msg;
  }
  static of(status: number, msg: string = "") {
    return new Response(status, msg, {});
  }
  json(body: unknown) {
    return new Response(
      this.status,
      this.message,
      this.headers,
      JSON.stringify(body)
    );
  }
  header(name: string, value: string | string[]) {
    return new Response(
      this.status,
      this.message,
      { ...this.headers, [name]: value },
      this.body
    );
  }
  defaultHeader(name: string, value: string | string[]) {
    return new Response(
      this.status,
      this.message,
      { [name]: value, ...this.headers },
      this.body
    );
  }
  mergeHeaders(headers: Headers) {
    return new Response(
      this.status,
      this.message,
      { ...this.headers, ...headers },
      this.body
    );
  }
  defaultHeaders(headers: Headers) {
    return new Response(
      this.status,
      this.message,
      { ...headers, ...this.headers },
      this.body
    );
  }
}

export const Ok = Response.of(200, "OK");
export const Created = Response.of(201, "Created");
export const Accepted = Response.of(202, "Accepted");
export const NoContent = Response.of(204, "No Content");

export const BadRequest = Response.of(400, "Bad Request");
export const Unauthorized = Response.of(401, "Unauthorized");
export const Forbidden = Response.of(403, "Forbidden");
export const NotFound = Response.of(404, "Not Found");
export const NotAllowed = Response.of(405, "Method Not Allowed");
export const IsTeapot = Response.of(418, "I'm a teapot");

export const ServerError = Response.of(500, "Internal Server Error");
export const ServerUnavailable = Response.of(503, "Service Unavailable");

export type Base = {
  request: Request;
  headers: Headers;
};

export type Context<T> = Base & T;

type LazyPromise<T> = T | Promise<T>;

type MergeProps<Props, MoreProps> = Props & Omit<MoreProps, keyof Props>;

export type Builder<Props = Base> = {
  with: <MoreProps>(
    f: Middleware<Props, MoreProps>
  ) => Builder<MergeProps<Props, MoreProps>>;

  handle: (
    f: (context: Context<Props>) => LazyPromise<Response>
  ) => Promise<Response>;
};

type PropsWithHeaders<T> = { props: T; headers?: Headers };

export type Middleware<Props, MoreProps> = (
  context: Context<Props>
) => LazyPromise<MiddlewareResult<MoreProps>>;

export type MiddlewareResult<T> = Result<Response, PropsWithHeaders<T>>;

export const middleware = <MoreProps, Props = Base>(
  f: Middleware<Props, MoreProps>
) => {
  return f;
};

const ContextBuilder = <Props>(
  value: FutureResult<Response, Context<Props>>
): Builder<Props> => {
  return {
    with: <MoreProps>(f: Middleware<Props, MoreProps>) => {
      return ContextBuilder(
        value.chain((context) =>
          FutureResult.of(async () => await f(context))
            .map(
              ({
                props,
                headers,
              }): Context<Props & Omit<MoreProps, keyof Props>> => {
                return {
                  ...props,
                  ...context,
                  headers: { ...context.headers, ...headers },
                };
              }
            )
            .mapFailure((res) => res.defaultHeaders(context.headers))
        )
      );
    },

    handle: async (f: (context: Context<Props>) => LazyPromise<Response>) => {
      return value
        .chain((context) =>
          FutureResult.of(async () => Success(await f(context))).map((res) =>
            res.defaultHeaders(context.headers)
          )
        )
        .fold(
          (err) => err,
          (x) => x
        );
    },
  };
};

export const context = <T = Base>(context: Context<T>) =>
  ContextBuilder(FutureResult.of(async () => Success(context)));

export type ContextResult<T> = Promise<Result<Response, T>>;

export const inject =
  <T, Props extends Base, K extends string>(
    key: K,
    errorResponse: Response,
    factory: (context: Context<Props>) => LazyPromise<Result<unknown, T>>
  ): Middleware<Props, { [P in K]: T }> =>
  async (context) =>
    (await factory(context))
      .mapFailure((error) => errorResponse.json({ error }))
      .chain((value) => setProp(key, value));

export const validate = <T, Props extends Base, K extends string>(
  key: K,
  validate: (context: Context<Props>) => Promise<Result<unknown, T>>
) => inject(key, BadRequest, validate);

export const decodeBody =
  <T>(codec: t.Decoder<unknown, T>) =>
  async <Props>({ request }: Context<Props>): Promise<Result<string, T>> => {
    const body = await readBody(request.body);
    try {
      const result = codec.decode(JSON.parse(body));
      if (result._tag === "Left") {
        return Failure(PathReporter.report(result).join("\n"));
      }
      return Success(result.right);
    } catch (error) {
      return Failure("" + error);
    }
  };

export const validateBody = <T, Props extends Base, K extends string>(
  key: K,
  codec: t.Decoder<unknown, T>
) => validate<T, Props, K>(key, decodeBody(codec));

export const setProps = <T>(value: T): MiddlewareResult<T> =>
  Success({ props: value });

export const setProp = <K extends string, V>(
  key: K,
  value: V
): MiddlewareResult<{ [P in K]: V }> =>
  setProps({ [key]: value } as { [P in K]: V });

export const setHeaders = (
  headers: Headers
): MiddlewareResult<Record<string, never>> => {
  return Success({ props: {}, headers });
};

export const injectProps =
  <T>(p: T) =>
  () =>
    setProps(p);

export const setHeader = (key: string, value: string | string[]) =>
  setHeaders({ [key]: value });

export const injectHeader = (key: string, value: string | string[]) => () =>
  setHeader(key, value);

export const injectHeaders = (value: Headers) => () => setHeaders(value);

export type App = (req: Request, res: ServerResponseInterface) => Promise<void>;

export type BootContext = Builder<Base>;

export const toRequest = (req: http.IncomingMessage): Request => {
  if (!req.url) throw new Error("no url");
  if (!req.method) throw new Error("no method");
  return {
    url: req.url,
    method: req.method,
    headers: req.headers,
    body: req,
  };
};

export const nodeHttp =
  (app: App) => (req: http.IncomingMessage, res: http.ServerResponse) =>
    app(toRequest(req), res);

export const app = <T extends Base>(
  boot: (ctx: BootContext) => LazyPromise<Builder<T>>,
  routes: (
    context: Builder<T>
  ) => (method: string, url: string) => Promise<Response>
): App => {
  return async (request, res) => {
    try {
      const baseContext = { request, headers: { Connection: "keep-alive" } };
      const ctx = await boot(context(baseContext));
      const response = await routes(ctx)(request.method, request.url);
      sendResponse(response, res);
    } catch (error) {
      console.error(error);
      sendResponse(ServerError, res);
    }
  };
};

export function getClientIp(req: http.IncomingMessage) {
  const xForwardedFor = req.headers["x-forwarded-for"];
  if (typeof xForwardedFor === "string") {
    return xForwardedFor.split(",")[0].trim();
  }
  return req.socket.remoteAddress ?? "<unknown>";
}
