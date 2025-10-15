interface ProxyEnv {
  API_PROXY_BASE_URL?: string;
  API_PROXY_ORIGIN?: string;
}

export interface EventContext {
  request: Request;
  params: Record<string, string | string[] | undefined>;
  env: ProxyEnv;
}

const DEFAULT_PROXY_BASE = "https://yt-clip-api.word-game.workers.dev";

const normalizeBaseUrl = (raw: string | undefined): string | null => {
  if (!raw) {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.replace(/\/+$/, "");
};

const resolveProxyBase = (env: ProxyEnv): string => {
  return (
    normalizeBaseUrl(env.API_PROXY_BASE_URL) ??
    normalizeBaseUrl(env.API_PROXY_ORIGIN) ??
    DEFAULT_PROXY_BASE
  );
};

const buildTargetUrl = (
  base: string,
  upstreamPrefix: string | null,
  subPath: string,
  search: string
): string => {
  const normalizedBase = base.replace(/\/+$/, "");
  const prefix = upstreamPrefix ? `/${upstreamPrefix.replace(/^\/+|\/+$/g, "")}` : "";
  const suffix = subPath ? `/${subPath}` : "";
  return `${normalizedBase}${prefix}${suffix}${search}`;
};

interface ProxyOptions {
  upstreamPrefix?: string | null;
}

export const handleProxyRequest = async (
  { request, params, env }: EventContext,
  options: ProxyOptions = {}
) => {
  const url = new URL(request.url);
  const pathParam = (params as Record<string, string | string[] | undefined>).path;
  const segments = Array.isArray(pathParam)
    ? pathParam
    : typeof pathParam === "string" && pathParam.length > 0
      ? pathParam.split("/")
      : [];
  const sub = segments.join("/");
  const proxyBase = resolveProxyBase(env);
  const target = buildTargetUrl(proxyBase, options.upstreamPrefix ?? null, sub, url.search);

  const requestOrigin = request.headers.get("origin") ?? "*";

  if (request.method === "OPTIONS") {
    const requestedHeaders = request.headers.get("access-control-request-headers") ?? "content-type, authorization";

    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": requestOrigin,
        "Access-Control-Allow-Methods": "GET,HEAD,POST,PUT,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": requestedHeaders,
        "Access-Control-Max-Age": "86400",
        "Vary": "Origin",
      },
    });
  }

  const headers = new Headers(request.headers);
  headers.delete("origin");
  headers.delete("referer");

  let resp: Response;
  try {
    resp = await fetch(target, {
      method: request.method,
      headers,
      body: (request.method === "GET" || request.method === "HEAD")
        ? undefined
        : await request.arrayBuffer(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: "Upstream request failed", message }), {
      status: 502,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": requestOrigin,
        "Access-Control-Allow-Methods": "GET,HEAD,POST,PUT,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "content-type, authorization, x-user-email, x-user-name",
        "Vary": "Origin",
      },
    });
  }

  const out = new Headers(resp.headers);
  out.delete("access-control-allow-origin");
  out.delete("access-control-allow-headers");
  out.delete("access-control-allow-methods");

  out.set("Access-Control-Allow-Origin", requestOrigin);
  out.set("Access-Control-Allow-Methods", "GET,HEAD,POST,PUT,DELETE,OPTIONS");
  out.set("Access-Control-Allow-Headers", "content-type, authorization, x-user-email, x-user-name");
  out.set("Vary", "Origin");

  if (!out.has("Content-Type") && resp.headers.has("Content-Type")) {
    out.set("Content-Type", resp.headers.get("Content-Type")!);
  }

  const bodyBuffer = await resp.arrayBuffer();

  return new Response(bodyBuffer, {
    status: resp.status,
    statusText: resp.statusText,
    headers: out,
  });
};
