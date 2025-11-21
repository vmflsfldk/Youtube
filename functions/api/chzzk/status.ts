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

  // ✅ 사용자님이 확인하신 '치지직 웹 API' 주소 사용
  const chzzkApiUrl = `https://api.chzzk.naver.com/service/v1/channels/${channelId}`;

  try {
    const response = await fetch(chzzkApiUrl, {
      method: "GET",
      headers: {
        // ⚠️ 중요: 봇 차단을 피하기 위해 브라우저(User-Agent)인 척 해야 합니다.
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Content-Type": "application/json",
        "Referer": "https://chzzk.naver.com/",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7"
      },
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ error: `Chzzk API Error: ${response.status}` }), {
        status: response.status,
        headers: { "Content-Type": "application/json" }
      });
    }

    const data: any = await response.json();
    const content = data.content;

    if (!content) {
      return new Response(JSON.stringify({ isLive: false }), { 
        headers: { "Content-Type": "application/json" } 
      });
    }

    // ✅ 확인하신 'openLive' 필드 사용
    const isLive = content.openLive === true;

    const result = {
      isLive: isLive,
      title: content.liveTitle || "", // 방송 중이 아니면 null일 수 있음
      thumbnail: content.liveImageUrl ? content.liveImageUrl.replace('{type}', '1080') : "",
      viewerCount: content.concurrentUserCount || 0,
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
