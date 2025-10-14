# Cloudflare Workers 배포 가이드

이 문서는 `yt-clip-api` Cloudflare Worker와 D1 데이터베이스를 프로덕션 환경으로 배포하는 절차를 설명합니다.

## 1. 사전 준비

- Cloudflare 계정과 Workers & D1 권한
- Node.js 18 이상
- Wrangler CLI (`npm install -g wrangler`)
- 레포지토리 체크아웃 및 `wrangler.toml` 확인

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

## 4. 마이그레이션 적용

모든 마이그레이션 SQL 파일은 `migrations/` 디렉터리에 있습니다.

```bash
wrangler d1 migrations apply ytclipdb
```

명령이 성공하면 `users`, `artists`, `videos`, `clips` 등 서비스 테이블이 생성됩니다. (마이그레이션 내용은 `migrations/0001_init.sql` 참고)

## 5. 로컬에서 최종 점검

배포 전 로컬 프리뷰로 API를 확인합니다.

```bash
wrangler dev
```

- 기본 바인딩으로 로컬 D1 프록시가 연결됩니다.
- API 호출 시 `X-User-Email`, `X-User-Name` 헤더를 지정하면 Worker가 사용자 컨텍스트를 생성합니다.

## 6. 프로덕션 배포

```bash
wrangler deploy
```

배포가 완료되면 Workers.dev 주소 또는 커스텀 도메인이 출력됩니다. Cloudflare Pages에 프론트엔드를 함께 호스팅하는 경우 Pages Functions가 `/api/*` 경로를 워커로 프록시하므로 추가 설정 없이 동일 오리진에서 API를 호출할 수 있습니다. 다른 호스트를 사용하려면 프론트엔드 환경 변수 `VITE_API_BASE_URL`을 원하는 엔드포인트(예: `https://yt-clip-api.<account>.workers.dev`)로 지정하세요.

## 7. 배포 후 확인 사항

- `wrangler d1 execute ytclipdb --command "SELECT COUNT(*) FROM users;"`와 같은 쿼리로 데이터베이스 상태를 점검합니다.
- Cloudflare 대시보드 → Workers → Deployments에서 최신 배포가 활성화되어 있는지 확인합니다.
- 필요 시 `wrangler tail`로 실시간 로그를 수집해 에러를 파악합니다.

## 8. Super Bot Fight Mode 예외 설정

워커 엔드포인트가 Cloudflare Bot 관리 기능(Managed Challenge, Super Bot Fight Mode 등)에 의해 차단되면 프론트엔드에서 `OPTIONS`,
`GET`, `POST` 요청이 실패하고, `wrangler tail`에도 호출이 기록되지 않습니다. 다음과 같이 예외 규칙을 추가해 워커 도메인에 대한 정당한
트래픽을 허용하세요.

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
