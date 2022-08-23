import * as t from "io-ts";
import * as Http from "./Http";
import router from "./router";
import { runTestApp as run, GET, POST } from "./HttpTests";
import { Failure } from "./Results";

test("basic app", async () => {
  const app = Http.app(
    async (ctx) => ctx,
    (ctx) =>
      router({
        "/foo": async () =>
          Http.resource({
            get: () => ctx.handle(async () => Http.Ok),
          }),
      })
  );

  expect((await run(app, GET("/foo"))).status).toEqual(200);
  expect((await run(app, GET("/bar"))).status).toEqual(404);
  expect((await run(app, POST("/foo"))).status).toEqual(405);
});

test("async is optional", async () => {
  const app = Http.app(
    (ctx) => ctx,
    (ctx) =>
      router({
        "/foo": () =>
          Http.resource({
            get: () =>
              ctx.with(Http.injectHeader("x-test", "ok")).handle(() => Http.Ok),
          }),
      })
  );

  const ok = await run(app, GET("/foo"));
  expect(ok.status).toEqual(200);

  expect(ok.headers?.["x-test"]).toEqual("ok");
  expect((await run(app, GET("/bar"))).status).toEqual(404);
  expect((await run(app, POST("/foo"))).status).toEqual(405);
});

test("middleware headers propagate through failure", async () => {
  const app = Http.app(
    async (ctx) => ctx.with(Http.injectHeader("x-test-header-foo", "foo")),
    (ctx) =>
      router({
        "/foo": async () =>
          Http.resource({
            get: () =>
              ctx
                .with(Http.injectHeader("x-test-header-bar", "bar"))
                .with(async () =>
                  Failure(Http.NotFound.header("x-test-header-foo", "foobar"))
                )
                .handle(async () => Http.Ok),
          }),
      })
  );

  const res = await run(app, GET("/foo"));
  expect(res.status).toEqual(404);
  expect(res.headers).toEqual({
    Connection: "keep-alive",
    "Content-Type": "application/json",
    "x-test-header-foo": "foobar",
    "x-test-header-bar": "bar",
  });
});

test("middleware headers propagate through success", async () => {
  const app = Http.app(
    async (ctx) => ctx.with(() => Http.setHeader("x-test-header-foo", "foo")),
    (ctx) =>
      router({
        "/foo": () =>
          Http.resource({
            get: () =>
              ctx
                .with(() => Http.setHeader("x-test-header-bar", "bar"))
                .with(() => Http.setHeader("x-test-header-baz", "baz"))
                .handle(() =>
                  Http.Ok.header("x-test-header-foo", "foobar").header(
                    "x-test-header-quux",
                    "quux"
                  )
                ),
          }),
      })
  );

  const res = await run(app, GET("/foo"));
  expect(res.status).toEqual(200);
  expect(res.headers).toEqual({
    Connection: "keep-alive",
    "Content-Type": "application/json",
    "x-test-header-foo": "foobar",
    "x-test-header-bar": "bar",
    "x-test-header-baz": "baz",
    "x-test-header-quux": "quux",
  });
});

test("basic body type validation", async () => {
  const app = Http.app(
    (ctx) => ctx,
    (ctx) =>
      router({
        "/": () =>
          Http.resource({
            post: () =>
              ctx
                .with(
                  Http.validateBody(
                    "body",
                    t.type({ foo: t.string, bar: t.boolean, baz: t.number })
                  )
                )
                .handle((context) => {
                  const theBody: { foo: string; bar: boolean; baz: number } =
                    context.body;
                  // @ts-expect-error should not be assignable
                  const x: number = context.body.foo;
                  // @ts-expect-error should not be assignable
                  const y: boolean = context.body.baz;
                  // @ts-expect-error should not be assignable
                  const z: string = context.body.bar;
                  return Http.Ok.json(theBody);
                }),
          }),
      })
  );

  const res = await run(app, POST("/", { foo: "hello", bar: true, baz: 42 }));
  expect(res.status).toEqual(200);
  expect(res.body).toBeTruthy();
  const json = JSON.parse(res.body!);
  expect(json).toHaveProperty("foo", "hello");
  expect(json).toHaveProperty("bar", true);
  expect(json).toHaveProperty("baz", 42);
});
