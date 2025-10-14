export const onRequest: PagesFunction = async ({ request, params }) => {
  const url = new URL(request.url);
  const sub = Array.isArray((params as any).path)
    ? (params as any).path.join("/")
    : ((params as any).path || "");
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
