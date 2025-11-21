interface Env {
  CHZZK_CLIENT_ID: string;
  CHZZK_CLIENT_SECRET: string;
}

type PagesFunction<Bindings = unknown> = (context: {
  request: Request;
  env: Bindings;
}) => Response | Promise<Response>;

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const channelId = url.searchParams.get("channelId");

  if (!channelId) {
    return new Response("Channel ID is required", { status: 400 });
  }

  const chzzkApiUrl = `https://api.chzzk.naver.com/service/v1/channels/${channelId}`;

  try {
    const response = await fetch(chzzkApiUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Client-Id": env.CHZZK_CLIENT_ID,
        "Client-Secret": env.CHZZK_CLIENT_SECRET,
      },
    });

    if (!response.ok) {
      return new Response(`Chzzk API Error: ${response.status}`, { status: response.status });
    }

    const data: any = await response.json();

    const result = {
      isLive: data.content?.openLive || false,
      title: data.content?.liveTitle || "",
      thumbnail: data.content?.liveImageUrl || "",
    };

    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Failed to fetch Chzzk status" }), { status: 500 });
  }
};
