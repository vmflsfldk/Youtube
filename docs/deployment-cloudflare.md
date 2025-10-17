# Cloudflare Workers 배포 가이드

이 문서는 `yt-clip-api` Cloudflare Worker와 D1 데이터베이스를 프로덕션 환경으로 배포하는 절차를 설명합니다.

## 1. 사전 준비

- Cloudflare 계정과 Workers & D1 권한
- Node.js 18 이상
- Wrangler CLI (`npm install -g wrangler`)
- 레포지토리 체크아웃 및 `wrangler.toml` 확인
- Google OAuth 클라이언트 ID (Google Cloud 콘솔에서 발급)
- YouTube Data API v3 키 (Google Cloud 콘솔에서 발급)

> `wrangler.toml`에는 Worker 이름과 D1 바인딩이 정의되어 있습니다. 필요하다면 `account_id`나 `workers_dev` 옵션을 추가해 자신의 계정과 환경에 맞게 수정하세요.

```toml
name = "yt-clip-api"
main = "src/worker.ts"
compatibility_date = "2025-10-14"
migrations_dir = "migrations"

[[d1_databases]]
binding = "DB"
database_name = "ytclipdb"
database_id = "8d173d8b-ebd6-4a4f-8e47-c279ed278416"
```

## 2. Cloudflare 로그인

```bash
wrangler login
```

브라우저 인증 후 Wrangler가 Cloudflare 계정과 연결됩니다. 이후 명령은 `account_id`를 자동으로 감지하지만, 오류가 발생하면 `wrangler.toml`에 `account_id = "<your-account-id>"`를 추가합니다.

## 3. D1 데이터베이스 생성 또는 연결

1. 새 데이터베이스가 필요하다면:
   ```bash
   wrangler d1 create ytclipdb
   ```
   위 명령은 데이터베이스 ID를 출력합니다. 해당 ID로 `wrangler.toml`의 `database_id` 값을 업데이트합니다.

2. 기존 데이터베이스를 사용할 경우 `wrangler d1 list`로 확인 후 `database_name`과 `database_id`가 일치하는지 확인합니다.

## 4. Google OAuth 클라이언트 설정

Google 로그인 버튼이 동작하려면 프론트엔드와 Worker가 **동일한** Google OAuth 클라이언트 ID를 사용해야 합니다. 기본값은 데모 페이지용으로 제한돼 있으므로 실서비스 도메인에서는 반드시 자신만의 클라이언트 ID를 입력하세요.

1. **Cloudflare Worker 환경 변수 설정**

   Worker는 `GOOGLE_CLIENT_ID` 또는 `GOOGLE_OAUTH_CLIENT_IDS` 환경 변수에서 허용된 클라이언트 ID 목록을 읽어 ID 토큰을 검증합니다. 아래 명령으로 환경 변수를 등록한 뒤 재배포하세요.

   ```bash
   wrangler secret put GOOGLE_CLIENT_ID
   ```

   여러 개의 클라이언트를 허용하려면 `GOOGLE_OAUTH_CLIENT_IDS`에 쉼표로 구분된 값을 입력할 수 있습니다.

2. **프론트엔드 환경 변수 설정**

   Vite 빌드에는 동일한 값을 `VITE_GOOGLE_CLIENT_ID`로 주입해야 합니다.
   `VITE_GOOGLE_CLIENT_ID`를 따로 설정하지 않은 경우, `GOOGLE_CLIENT_ID` 값이 자동으로 사용됩니다.

   - Cloudflare Pages: 프로젝트 Settings → Environment variables에서 `VITE_GOOGLE_CLIENT_ID`를 추가하고 프리뷰/프로덕션 환경 모두에 값을 입력하세요.
   - 로컬 개발: `frontend/.env.local` 파일을 생성해 `VITE_GOOGLE_CLIENT_ID=<your-client-id>` 형태로 저장합니다.

   값이 지정되지 않은 경우 프론트엔드는 콘솔 경고와 함께 데모용 기본 클라이언트 ID로 폴백하지만, 해당 ID는 대부분의 도메인에서 동작하지 않습니다.

## 5. YouTube Data API 키 설정

Cloudflare Worker가 실제 YouTube 메타데이터를 가져오려면 `YOUTUBE_API_KEY` 시크릿을 설정해야 합니다. Wrangler에서 아래 명령을 실행하고
프롬프트에 API 키를 붙여 넣으면 Workers 환경에 암호화된 값이 저장됩니다. **시크릿을 추가한 뒤에는 `wrangler deploy`로 워커를 다시 배포해**
최신 시크릿이 실행 중인 배포에 반영되었는지 확인하세요.

```bash
wrangler secret put YOUTUBE_API_KEY
```

CI/CD 파이프라인을 사용하는 경우에도 동일한 이름의 시크릿을 구성해야 합니다. 키가 누락되면 워커는 기본 썸네일과 제목만 사용하는 폴백
메타데이터로 처리합니다.

> ⚠️ Cloudflare Pages Functions를 통해 `/api/*` 경로를 프록시하는 경우, Pages 프로젝트의 **Settings → Functions → Environment variables**
> 메뉴에서도 동일한 `YOUTUBE_API_KEY` 시크릿을 추가해야 합니다. 프리뷰/프로덕션 환경이 분리돼 있다면 두 환경 모두에 키를 입력하세요.
> Pages Functions에서 시크릿을 갱신한 뒤에는 새 배포를 트리거해야 런타임에서 값을 읽을 수 있습니다.

로컬 `wrangler dev` 환경에서 YouTube API를 사용하려면 `.dev.vars` 파일에 `YOUTUBE_API_KEY=...`를 추가하거나, `wrangler secret put --local
YOUTUBE_API_KEY` 명령으로 로컬 시크릿을 등록한 뒤 개발 서버를 다시 실행하세요.

## 6. 마이그레이션 적용

모든 마이그레이션 SQL 파일은 `migrations/` 디렉터리에 있습니다.

```bash
wrangler d1 migrations apply ytclipdb
```

명령이 성공하면 `users`, `artists`, `videos`, `clips` 등 서비스 테이블이 생성됩니다. (마이그레이션 내용은 `migrations/0001_init.sql` 참고)

## 7. 로컬에서 최종 점검

배포 전 로컬 프리뷰로 API를 확인합니다.

```bash
wrangler dev
```

- 기본 바인딩으로 로컬 D1 프록시가 연결됩니다.
- API 호출 시 `X-User-Email`, `X-User-Name` 헤더를 지정하면 Worker가 사용자 컨텍스트를 생성합니다.
- **중요:** 위 모드는 Cloudflare D1이 아닌 Miniflare 기반의 로컬 인메모리 DB를 사용합니다. 실제 D1에 쓰기가 발생하지 않으므로
  Cloudflare 대시보드에서는 데이터가 증가하지 않습니다. 배포 전 실제 D1을 대상으로 테스트하려면 아래 중 하나를 선택합니다.
  - `wrangler dev --remote`: 프리뷰 모드에서 Cloudflare 인프라 및 실제 D1 바인딩을 사용합니다. 네트워크 지연이 존재하지만 DB 쓰기 결과를 즉시 확인할 수 있습니다.
  - 이미 배포된 워커 엔드포인트(예: `https://yt-clip-api.<account>.workers.dev`)에 직접 요청합니다.
  - CLI에서 `wrangler d1 execute ytclipdb --command "SELECT * FROM artists"`와 같이 쿼리를 실행해 실제 DB의 상태를 확인합니다.
  - API 요청 후 `wrangler tail yt-clip-api --persist`로 워커 로그를 확인하면 요청이 원격 워커까지 도달했는지 빠르게 검증할 수 있습니다.

## 8. 프로덕션 배포

```bash
wrangler deploy
```

배포가 완료되면 Workers.dev 주소 또는 커스텀 도메인이 출력됩니다. Cloudflare Pages에 프론트엔드를 함께 호스팅하는 경우 Pages Functions가 `/api/*` 경로를 워커로 프록시하므로 추가 설정 없이 동일 오리진에서 API를 호출할 수 있습니다. 다른 호스트를 사용하려면 프론트엔드 환경 변수 `VITE_API_BASE_URL`을 원하는 엔드포인트(예: `https://yt-clip-api.<account>.workers.dev`)로 지정하고, Pages Functions 환경 변수 `API_PROXY_BASE_URL`(또는 `API_PROXY_ORIGIN`)에 동일한 값을 입력해 프록시 대상도 함께 변경하세요.

> **주의:** Cloudflare Bot 관리 기능이 Workers.dev 호스트의 `OPTIONS` 사전 요청을 차단하는 경우, 브라우저에서 동일 오리진 `/api` 경로를 사용하면 프리플라이트 자체가 발생하지 않아 문제를 우회할 수 있습니다. 반드시 교차 오리진 호출이 필요한 상황이 아니라면 기본 `/api` 프록시 구성을 유지하세요. 부득이하게 외부 호스트를 직접 호출해야 한다면 프론트엔드 빌드에 `VITE_ALLOW_CROSS_ORIGIN_API=true`를 추가해 경고 없이 원격 엔드포인트를 사용하도록 강제할 수 있습니다.

## 9. 배포 후 확인 사항

- `wrangler d1 execute ytclipdb --command "SELECT COUNT(*) FROM users;"`와 같은 쿼리로 데이터베이스 상태를 점검합니다.
- Cloudflare 대시보드 → Workers → Deployments에서 최신 배포가 활성화되어 있는지 확인합니다.
- 필요 시 `wrangler tail`로 실시간 로그를 수집해 에러를 파악합니다.

## 10. Super Bot Fight Mode 예외 설정

워커 엔드포인트가 Cloudflare Bot 관리 기능(Managed Challenge, Super Bot Fight Mode 등)에 의해 차단되면 프론트엔드에서 `OPTIONS`, `GET`, `POST` 요청이 실패하고, `wrangler tail`에도 호출이 기록되지 않습니다. Pages Functions를 통해 동일 오리진 `/api` 경로를 사용하면 브라우저가 사전 요청을 보내지 않아 이러한 차단을 피할 수 있습니다. 동일 오리진 프록시를 사용할 수 없는 경우에는 아래 절차대로 예외 규칙을 추가해 워커 도메인에 대한 정당한 트래픽을 허용하세요.

1. Cloudflare 대시보드에서 **Security → WAF (또는 Bots)** 메뉴로 이동합니다.
2. `yt-clip-api` 워커 호스트에 대한 커스텀 규칙을 추가하고 아래와 같은 Expression을 설정합니다.

   ```
   (http.host eq "yt-clip-api.word-game.workers.dev" and http.request.method in {"OPTIONS","GET","POST"})
   ```

3. **Action**을 **Skip**으로 지정하고, Super Bot Fight Mode/Managed Challenge/JS Challenge가 건너뛰어지도록 설정합니다.
4. 규칙을 저장한 뒤, 아래와 같이 사전 요청을 다시 전송해 204 응답과 `Access-Control-Allow-*` 헤더가 반환되는지 확인합니다.

   ```bash
   curl -i -X OPTIONS "https://yt-clip-api.word-game.workers.dev/api/artists" \
     -H "Origin: https://youtube-1my.pages.dev" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: content-type, authorization"
   ```

정상적으로 구성됐다면 Super Bot Fight Mode가 워커 호출을 차단하지 않으며, `wrangler tail`에서도 요청 로그를 확인할 수 있습니다.

이 과정을 통해 Cloudflare Workers와 D1 환경에 `yt-clip-api`를 배포할 수 있습니다.
