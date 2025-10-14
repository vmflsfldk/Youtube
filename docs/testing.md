# 테스트 가이드

이 프로젝트는 Cloudflare Workers 기반 API(`wrangler`), 참고용 Spring Boot 백엔드, React 프론트엔드로 구성되어 있습니다. 아래 절차는 각 구성요소를 검증하는 방법과 수동 시나리오 테스트를 설명합니다.

## 1. 자동화 테스트 실행

### 1.1 Spring Boot 참고 백엔드

Spring Boot 모듈에는 현재 예제 코드와 의존성만 포함되어 별도의 단위 테스트 클래스가 없습니다. 그래도 `mvn test`를 실행하면 JUnit 플랫폼이 구동되면서 애플리케이션 컨텍스트가 정상적으로 로드되는지 확인할 수 있습니다.

```bash
cd backend
mvn test
```

빌드가 성공하면 "BUILD SUCCESS" 메시지가 표시되고, 실패 시 스택 트레이스로 문제 원인을 확인할 수 있습니다. 필요하다면 `mvn -DskipTests=false test`처럼 테스트 생략 옵션이 끄도록 명시할 수 있습니다.

### 1.2 Cloudflare Worker + D1

Worker 프로젝트에는 아직 Vitest 등의 테스트 러너가 설정되어 있지 않습니다. 대신 `wrangler dev`로 로컬 시뮬레이션을 실행한 뒤 HTTP 클라이언트(curl, Postman 등)로 엔드포인트를 호출하여 동작을 검증합니다. D1 데이터베이스를 사용하는 경우, `wrangler d1 execute <DB명> --file=...` 명령으로 스키마를 초기화한 뒤 테스트를 진행할 수 있습니다.

```bash
wrangler dev
```

위 명령은 로컬에서 Worker를 띄우고, `http://127.0.0.1:8787`(기본값)로 요청을 보낼 수 있게 해줍니다.

## 2. 수동 통합 테스트 플로우

백엔드와 프론트엔드를 함께 띄운 뒤 주요 사용자 시나리오를 따라가면서 통합 동작을 점검합니다.

### 2.1 선행 준비

1. **Cloudflare Worker 실행** (또는 Spring Boot 참고 서버 실행)
   - Worker: 새 터미널에서 `wrangler dev`
   - Spring Boot: `cd backend && mvn spring-boot:run`
2. **프론트엔드 설치 및 실행**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   Vite 개발 서버가 `http://localhost:5173`에서 뜨며, API 프록시는 `.env` 설정 또는 기본 `/api` 프록시를 사용합니다.

### 2.2 API 수동 검증 (예: curl)

아래 예시는 로컬 Worker가 8787 포트에서 동작한다고 가정합니다.

```bash
# 1) 테스트용 사용자 헤더와 함께 아티스트 생성
curl -X POST "http://127.0.0.1:8787/api/artists" \
  -H "Content-Type: application/json" \
  -H "X-User-Email: test@example.com" \
  -H "X-User-Name: Test User" \
  -d '{"name":"NewJeans","youtubeChannelId":"UCwppdrjsBPAZg5_cUwQjfMQ"}'

# 2) 내 아티스트 목록 확인
curl "http://127.0.0.1:8787/api/artists?mine=true" \
  -H "X-User-Email: test@example.com" \
  -H "X-User-Name: Test User"

# 3) 영상과 클립 등록
curl -X POST "http://127.0.0.1:8787/api/videos" \
  -H "Content-Type: application/json" \
  -H "X-User-Email: test@example.com" \
  -H "X-User-Name: Test User" \
  -d '{"videoUrl":"https://www.youtube.com/watch?v=dQw4w9WgXcQ","artistId":1}'

curl -X POST "http://127.0.0.1:8787/api/clips" \
  -H "Content-Type: application/json" \
  -H "X-User-Email: test@example.com" \
  -H "X-User-Name: Test User" \
  -d '{"videoId":1,"title":"Chorus","startSec":42,"endSec":60,"tags":["hook"]}'
```

응답 JSON을 확인하면서 정상적으로 저장되는지 검증합니다. 필요 시 `wrangler d1 execute` 명령으로 D1 데이터베이스 내용을 직접 조회해도 됩니다.

### 2.3 프론트엔드 UI 확인

브라우저에서 `http://localhost:5173`에 접속하여 다음 흐름을 따라갑니다.

1. 아티스트 추가 폼에 위에서 생성한 채널 정보를 입력합니다.
2. 영상 URL을 추가하여 자동으로 메타데이터가 채워지는지 확인합니다.
3. 클립 생성 시 시작/끝 초 입력 후 저장하고, YouTube 플레이어가 해당 구간을 반복 재생하는지 확인합니다.
4. 자동 추천 기능이 구현되어 있다면 후보 리스트를 확인하고 선택 → 저장까지 완료합니다.

### 2.4 회귀 테스트 체크리스트

- 새 사용자 헤더로 요청했을 때 독립된 즐겨찾기 목록이 생성되는지 확인
- 동일한 클립을 중복 생성하려고 할 때 서버가 적절히 방지하는지 확인
- 프론트엔드에서 API 오류(예: 잘못된 videoId) 발생 시 사용자에게 메시지가 표시되는지 확인
- 모바일 또는 작은 화면에서도 플레이어 및 리스트 레이아웃이 깨지지 않는지 확인

위 과정을 반복하면 새로운 기능 추가 후에도 핵심 시나리오가 영향을 받지 않았는지 빠르게 검증할 수 있습니다.
