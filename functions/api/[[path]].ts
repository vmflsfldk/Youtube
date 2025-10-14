interface EventContext {
  request: Request;
  params: Record<string, string | string[] | undefined>;
}

export const onRequest = async ({ request, params }: EventContext) => {
  const url = new URL(request.url);
  const pathParam = (params as Record<string, string | string[] | undefined>).path;
  const segments = Array.isArray(pathParam)
    ? pathParam
    : typeof pathParam === "string" && pathParam.length > 0
      ? pathParam.split("/")
      : [];
  const sub = segments.join("/");
  const target = `https://yt-clip-api.word-game.workers.dev/api/${sub}${url.search}`;

  const headers = new Headers(request.headers);
  headers.delete("origin");
  headers.delete("referer");

  const resp = await fetch(target, {
    method: request.method,
    headers,
    body: (request.method === "GET" || request.method === "HEAD")
      ? undefined
      : await request.arrayBuffer(),
  });

  const out = new Headers(resp.headers);
  out.delete("access-control-allow-origin");
  out.delete("access-control-allow-headers");
  out.delete("access-control-allow-methods");

  return new Response(resp.body, { status: resp.status, headers: out });
};
