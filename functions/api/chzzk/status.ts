export const onRequestGet: PagesFunction = async (context) => {
  const { request } = context;
  const url = new URL(request.url);
  const channelId = url.searchParams.get("channelId");

  if (!channelId) {
    return new Response(JSON.stringify({ error: "Channel ID required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  // utahub 프록시를 사용해 치지직 라이브 여부를 확인한다.
  const chzzkApiUrl = `https://utahub.com/api/chzzk/status?channelId=${encodeURIComponent(channelId)}`;

  try {
    const response = await fetch(chzzkApiUrl, { method: "GET" });

    if (!response.ok) {
      return new Response(JSON.stringify({ error: `Chzzk API Error: ${response.status}` }), {
        status: response.status,
        headers: { "Content-Type": "application/json" }
      });
    }

    const data: any = await response.json();

    const result = {
      isLive: Boolean(data.isLive),
      title: data.title ?? "",
      thumbnail: data.thumbnail ?? "",
      viewerCount: data.viewerCount ?? 0,
    };

    return new Response(JSON.stringify(result), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*", // 프론트엔드 호출 허용
      },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
