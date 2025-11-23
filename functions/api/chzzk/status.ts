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

  const chzzkApiUrl = `https://api.chzzk.naver.com/service/v1/channels/${channelId}`;

  try {
    const response = await fetch(chzzkApiUrl, {
      method: "GET",
      headers: {
        // ✅ 헤더 보강: 실제 Chrome 브라우저처럼 보이도록 모든 보안 헤더 추가
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "Sec-Ch-Ua": '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-site",
        "Referer": "https://chzzk.naver.com/",
        "Origin": "https://chzzk.naver.com",
        "Connection": "keep-alive",
        "Cache-Control": "no-cache"
      },
    });

    if (!response.ok) {
      // 503 등의 에러가 나면 로그를 남기고 기본값(방송 아님)을 반환하여 화면이 깨지는 것을 방지
      console.error(`Chzzk API Error: ${response.status} for ${channelId}`);
      return new Response(JSON.stringify({ isLive: false, error: `Upstream ${response.status}` }), {
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

    const isLive = content.openLive === true;

    const result = {
      isLive: isLive,
      title: content.liveTitle || "",
      thumbnail: content.liveImageUrl ? content.liveImageUrl.replace('{type}', '1080') : "",
      viewerCount: content.concurrentUserCount || 0,
    };

    return new Response(JSON.stringify(result), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
