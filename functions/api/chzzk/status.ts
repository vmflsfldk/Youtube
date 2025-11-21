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
    return new Response(JSON.stringify({ error: "Channel ID required" }), { status: 400 });
  }

  // ✅ 공식 Open API 주소 사용
  const chzzkApiUrl = `https://openapi.chzzk.naver.com/open/v1/channels?channelIds=${channelId}`;

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
      return new Response(JSON.stringify({ error: "Chzzk API Error" }), { status: response.status });
    }

    const data: any = await response.json();
    const channelData = data.content?.data?.[0]; // ✅ 응답 구조에 맞춰 데이터 추출

    // 방송 중이 아니거나 데이터가 없으면 기본값 반환
    if (!channelData) {
      return new Response(JSON.stringify({ isLive: false }), { headers: { "Content-Type": "application/json" } });
    }

    const result = {
      isLive: channelData.openLive || false,
      title: channelData.liveTitle || "",
      thumbnail: channelData.liveImageUrl ? channelData.liveImageUrl.replace('{type}', '1080') : "",
      viewerCount: channelData.concurrentUserCount || 0
    };

    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
};
