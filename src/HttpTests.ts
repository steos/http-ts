import * as Http from "./Http";

export class TestResponseInterface implements Http.ServerResponseInterface {
  public status?: number;
  public headers?: Http.Headers;
  public body?: string;
  write(chunk: unknown): void {
    if (typeof chunk !== "string") {
      throw new Error(
        "only string chunks are currently supported in test interface"
      );
    }
    this.body = (this.body ?? "") + chunk;
  }
  writeHead(status: number, headers: Http.Headers): void {
    this.status = status;
    this.headers = headers;
  }
  end(): void {}
}

export const request = (
  method: string,
  url: string,
  body: string = "",
  headers: Http.Headers = {}
) => ({
  method,
  url,
  body,
  headers,
});

export const GET = (url: string, headers: Http.Headers = {}) =>
  request("GET", url, "", headers);

export const POST = (
  url: string,
  body: unknown = "",
  headers: Http.Headers = {}
) =>
  request(
    "POST",
    url,
    typeof body === "string" ? body : JSON.stringify(body),
    headers
  );

export const runTestApp = async (app: Http.App, request: Http.Request) => {
  const out = new TestResponseInterface();
  await app(request, out);
  return out;
};
