import router from "./router";
import * as Http from "./Http";
import * as t from "io-ts";
import http from "http";

type MyContext = Http.Base & {
  customBaseContextProp: string;
};

const route = (ctx: Http.Builder<MyContext>) =>
  router({
    "/foo": async () =>
      Http.resource({
        get: () =>
          ctx.handle(async ({ customBaseContextProp }) =>
            Http.Ok.json({ foo: customBaseContextProp })
          ),
      }),
    "/hello/{name}": ({ name }) =>
      Http.resource({
        get: () => ctx.handle(() => Http.Ok.json({ name })),
        post: () =>
          ctx
            .with(Http.validateBody("message", t.type({ greeting: t.string })))
            .handle(({ message }) =>
              Http.Ok.json({ message: message.greeting + ", " + name })
            ),
      }),
  });

const boot = (ctx: Http.Builder) =>
  ctx.with(Http.injectProps({ customBaseContextProp: "lorem ipsum" }));

const app = Http.app(boot, route);

const handleRequest = Http.nodeHttp(app);

const port = 8888;
const server = http.createServer();
server.on("request", handleRequest);
server.listen(port, () => {
  console.log(`listening on port ${port}`);
});
