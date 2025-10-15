import { handleProxyRequest } from "../_proxy";

export const onRequest = async (ctx: Parameters<typeof handleProxyRequest>[0]) => {
  return handleProxyRequest(ctx, { upstreamPrefix: "auth" });
};
