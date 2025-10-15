import worker, { type Env as WorkerEnv } from "../../src/worker";
import { handleProxyRequest } from "../_proxy";

const shouldUseProxy = (env: { API_PROXY_BASE_URL?: string; API_PROXY_ORIGIN?: string }): boolean => {
  const raw = env.API_PROXY_BASE_URL ?? env.API_PROXY_ORIGIN;
  return typeof raw === "string" && raw.trim().length > 0;
};

export const onRequest = async (ctx: Parameters<typeof handleProxyRequest>[0]) => {
  if (shouldUseProxy(ctx.env)) {
    return handleProxyRequest(ctx, { upstreamPrefix: "auth" });
  }

  if (ctx.request.method === "OPTIONS") {
    return worker.fetch(ctx.request, ctx.env as WorkerEnv);
  }

  if ("DB" in ctx.env && ctx.env.DB) {
    return worker.fetch(ctx.request, ctx.env as WorkerEnv);
  }

  return new Response(JSON.stringify({ error: "Database binding is not configured" }), {
    status: 500,
    headers: { "Content-Type": "application/json" }
  });
};
