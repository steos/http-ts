import * as Http from "./Http";

export type RouteArgs<K extends string> = Record<K, string>;

export type RouteValue<T, K extends string> = (
  args: RouteArgs<K>
) => T | null | Promise<T | null>;

export interface VarSegment {
  kind: "var";
  name: string;
}

export interface LiteralSegment {
  kind: "literal";
  value: string;
}

export type RouteSegment = VarSegment | LiteralSegment;

export type VarMatch = [string, string];

export type SegmentMatch = VarMatch | boolean;

const matchSegment = (
  pathSegment: string,
  routeSegment: RouteSegment
): SegmentMatch => {
  if (routeSegment.kind === "literal") {
    return pathSegment === routeSegment.value;
  } else if (routeSegment.kind === "var") {
    return [routeSegment.name, pathSegment];
  }
  throw new Error();
};

const matchPath = <T extends string>(
  pathS: string,
  routeS: T
): RouteArgs<ExtractSlugs<T>> | null => {
  const path = pathS.split("/");
  const route = routeS.split("/").map(readRouteSegment);
  if (path.length !== route.length) return null;
  const varEntries: VarMatch[] = [];
  for (let i = 0; i < path.length; ++i) {
    const match = matchSegment(path[i], route[i]);
    if (typeof match === "boolean") {
      if (match === false) {
        return null;
      }
    } else {
      varEntries.push(match);
    }
  }
  return Object.fromEntries(varEntries) as RouteArgs<ExtractSlugs<T>>;
};

const readRouteSegment = (segment: string): RouteSegment => {
  if (segment.startsWith("{") && segment.endsWith("}")) {
    return { kind: "var", name: segment.substring(1, segment.length - 1) };
  } else {
    return { kind: "literal", value: segment };
  }
};

export type RouteMatch<T, K extends string> = [T, RouteArgs<K>];

export type RouteMatcher<T> = (path: string) => Promise<T | null>;

type ExtractSlugs<T extends string> =
  T extends `${string}{${infer Slug}}/${infer After}`
    ? Slug | ExtractSlugs<After>
    : T extends `${string}{${infer Slug}}`
    ? Slug
    : never;

export type RouteTable<T> = {
  [K in keyof T]: K extends string
    ? RouteValue<Http.Resource, ExtractSlugs<K>>
    : never;
};

export type Router = (method: string, url: string) => Promise<Http.Response>;

export const routes = <T>(table: RouteTable<T>): RouteTable<T> => {
  return table;
};

const router = <T>(routes: RouteTable<T>): Router => {
  return async (method: string, url: string): Promise<Http.Response> => {
    const keys = Object.keys(routes) as (keyof T & string)[];
    method = method.toLowerCase();
    for (let key of keys) {
      const match = matchPath(url, key);
      if (match !== null) {
        const resource = await routes[key](match);
        if (resource == null) {
          return Http.NotFound;
        }
        if (resource.methods[method] == null) {
          return Http.NotAllowed;
        }
        const response = await resource.methods[method]();
        return response.defaultHeader("Content-Type", resource.contentType);
      }
    }
    return Http.NotFound;
  };
};

export default router;
