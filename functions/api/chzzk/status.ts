interface Env {
  // 비공식 API를 사용하므로 키가 필요 없지만, 
  // 기존 환경 변수 선언은 에러 방지를 위해 남겨두거나 무시해도 됩니다.
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request } = context;
  const url = new URL(request.url);
  const channelId = url.searchParams.get("channelId");

  if (!channelId) {
    return new Response(JSON.stringify({ error: "Channel ID required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  // ✅ 변경점 1: 공식 Open API -> 비공식 Polling API 주소로 변경
  // 이 주소는 실제 치지직 웹사이트에서 라이브 상태를 체크할 때 사용됩니다.
  const chzzkApiUrl = `https://api.chzzk.naver.com/polling/v2/channels/${channelId}/live-status`;

  try {
    const response = await fetch(chzzkApiUrl, {
      method: "GET",
      headers: {
        // ✅ 변경점 2: Client ID/Secret 제거 및 User-Agent 추가
        // 비공식 API는 봇 차단을 막기 위해 브라우저처럼 보이는 User-Agent가 필요할 수 있습니다.
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Content-Type": "application/json",
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

    // ✅ 변경점 3: 응답 데이터 파싱 로직 변경
    // Polling API는 'status' 필드로 'OPEN' / 'CLOSE'를 반환합니다.
    const isLive = content?.status === "OPEN";
    
    const result = {
      isLive: isLive,
      title: content?.liveTitle || "",
      thumbnail: content?.liveImageUrl ? content.liveImageUrl.replace('{type}', '1080') : "",
      viewerCount: content?.concurrentUserCount || 0,
      // 추가 정보 (필요 시 사용)
      category: content?.liveCategoryValue || "",
      adult: content?.adult || false
    };

    return new Response(JSON.stringify(result), {
      headers: { 
        "Content-Type": "application/json",
        // CORS 설정이 필요하다면 아래 헤더 추가
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
