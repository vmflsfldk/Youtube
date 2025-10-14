# 유튜브 클립 플레이어 아키텍처 개요

## 1. 전체 아키텍처

| 계층 | 사용 기술 | 주요 역할 |
| --- | --- | --- |
| 프론트엔드 | React, TypeScript, YouTube IFrame Player API | 로그인 UI, 아티스트/영상/클립 등록, 클립 재생, 자동 추천 결과 시각화 |
| 백엔드 | Spring Boot, Spring Security (OAuth2) | Google OAuth2 인증, JWT 세션 발급, 아티스트/영상/클립 CRUD, 권한 검증, 자동 구간 추출 처리(비동기 큐) |
| 데이터베이스 | PostgreSQL (예시) | User, Artist, Video, Clip, 사용자 즐겨찾기 테이블 관리 |
| 외부 API | YouTube Data API v3, YouTube IFrame Player API | 영상 메타데이터/썸네일/자막 조회, 영상 구간 재생 |

- **저장소 정책**: YouTube TOS 준수를 위해 영상 파일은 저장하지 않고 메타데이터와 타임코드만 보관합니다.

## 2. 핵심 기능

### A. 로그인 & 즐겨찾기 아티스트 관리
- Google OAuth2 기반 로그인 후 백엔드가 JWT 세션을 발급합니다.
- 사용자 엔드포인트 예시:
  - `POST /api/artists` : 아티스트 이름과 채널 ID 등록
  - `GET /api/artists?mine=true` : 내 즐겨찾기 아티스트 조회
  - `POST /api/users/me/favorites` : 즐겨찾기 추가/삭제
- **DB 스키마 예시**
  - `users(id, email, display_name, created_at)`
  - `artists(id, name, youtube_channel_id, created_by)`
  - `user_favorite_artists(user_id, artist_id)` – `UNIQUE (user_id, artist_id)` 인덱스 구성

### B. 유튜브 영상 등록
- 사용자가 YouTube URL을 입력하면 백엔드가 videoId를 파싱하고 Data API 호출을 통해 제목, 길이, 썸네일, 채널 정보를 가져와 저장합니다.
- `POST /api/videos` 요청 예시:

  ```json
  {
    "videoUrl": "https://www.youtube.com/watch?v=XXXX",
    "artistId": 12
  }
  ```

- 저장 컬럼 예시: `videos(id, artist_id, title, duration_sec, thumbnail_url, channel_id)`

### C. 클립 등록 및 재생
- 사용자 입력: `startSec`, `endSec`, `title`, `tags`.
- `POST /api/clips` 바디 예시:

  ```json
  {
    "videoId": 77,
    "title": "Chorus A",
    "startSec": 73,
    "endSec": 98,
    "tags": ["chorus"]
  }
  ```

- 프론트엔드는 YouTube IFrame Player API로 지정 구간만 재생하며, ENDED 이벤트를 감지해 구간 반복(loop)을 구현합니다.

  ```jsx
  import YouTube from 'react-youtube';

  export default function ClipPlayer({ ytId, startSec, endSec }) {
    let playerRef = null;

    const onReady = (e) => {
      playerRef = e.target;
      playerRef.loadVideoById({ videoId: ytId, startSeconds: startSec, endSeconds: endSec });
    };

    const onStateChange = (e) => {
      if (e.data === window.YT.PlayerState.ENDED) {
        playerRef.seekTo(startSec, true);
      }
    };

    return (
      <YouTube
        videoId={ytId}
        opts={{ playerVars: { autoplay: 1, controls: 1 } }}
        onReady={onReady}
        onStateChange={onStateChange}
      />
    );
  }
  ```

## 3. 자동 클립 추천 파이프라인
- **챕터/타임스탬프 파싱**: 영상 설명/댓글에서 `\d{1,2}:\d{1,2}:\d{2}` 형식의 타임스탬프를 정규식으로 추출해 후보 구간을 생성합니다.
- **자막 분석**: 자막이 있을 경우 가사/노랫말 특성을 기반으로 스코어링하여 노래일 가능성이 높은 구간을 우선 추천합니다.
  - 텍스트 밀도, 반복 패턴, 키워드 등을 점수화합니다.
- **사용자 보정 루프**: 추천 구간을 UI에 표시해 사용자가 수동으로 미세 조정 후 저장할 수 있게 합니다.

## 4. 백엔드 엔드포인트 설계 예시
- `POST /api/videos:parse` : URL → videoId 파싱 및 메타데이터 저장
- `POST /api/clips` / `GET /api/clips?artistId=` : 클립 등록 및 조회
- `POST /api/clips/auto-detect`
  - 요청: `{ "videoId": 77, "mode": "captions|chapters|ml" }`
  - 응답: `[ { "startSec": 73, "endSec": 98, "score": 0.92, "label": "Chorus" }, ... ]`
- 권한 정책: 자신이 등록한 아티스트와 클립만 수정 가능 (`ROLE_USER`)

## 5. UI 흐름
1. 아티스트 추가 → 채널 연동
2. 영상 URL 입력 → 메타데이터 자동 채움
3. 클립 추가: 슬라이더/시간 입력으로 시작·끝 설정, 즉시 프리뷰
4. 자동 추천 보기 → 후보 중 선택 후 저장
5. 아티스트 페이지에서 클립 플레이리스트 재생 (루프/셔플 제공)

## 6. 확장 아이디어
- 클립 플레이리스트 공유 (공개/비공개)
- 좋아요/북마크/태그 기반 추천 랭킹
- 채널/키워드 검색 후 인기 클립 자동 생성
- 모바일 PWA 지원, 키보드 단축키(I/O로 in/out 설정 등)

## 7. 구현 가이드

### 백엔드 옵션

#### A. Cloudflare Workers + D1 (기본)

- `wrangler.toml`에 정의된 Cloudflare Worker(`yt-clip-api`)가 D1 데이터베이스(`ytclipdb`)와 통신합니다.
- 개발 환경에서는 아래 명령어로 로컬 프록시를 실행할 수 있습니다.

  ```bash
  wrangler dev
  ```

- 요청 헤더 `X-User-Email`, `X-User-Name` 으로 사용자 컨텍스트를 전달하며, 값이 없으면 게스트 계정이 자동으로 생성됩니다.
- 프론트엔드에서 Cloudflare Worker를 호출하려면 `VITE_API_BASE_URL`을 Worker 엔드포인트(예: `https://yt-clip-api.your-account.workers.dev`)로 설정합니다. Cloudflare Pages에 함께 배포한 경우 기본값은 동일 오리진 `/api` 경로이며, Pages Functions가 기본적으로 `yt-clip-api.word-game.workers.dev`로 프록시합니다. 자체 워커 엔드포인트를 사용하려면 Pages 프로젝트의 환경 변수 `API_PROXY_BASE_URL`(또는 `API_PROXY_ORIGIN`)을 원하는 호스트로 지정하세요. 값은 `https://your-worker.workers.dev` 혹은 `http://127.0.0.1:8787` 처럼 `/api` 이전까지만 입력하면 됩니다.
- 제공되는 REST 엔드포인트는 기존 Spring Boot 버전과 동일합니다.

| Method | Endpoint | 설명 |
| --- | --- | --- |
| POST | `/api/artists` | 아티스트 생성 |
| GET | `/api/artists?mine=true` | 즐겨찾기 아티스트 조회 |
| POST | `/api/users/me/favorites` | 즐겨찾기 토글 |
| POST | `/api/videos` | YouTube URL 메타데이터 저장 |
| POST | `/api/clips` | 클립 생성 |
| GET | `/api/clips?videoId=` | 특정 영상의 클립 조회 |
| POST | `/api/clips/auto-detect` | 자막/설명 기반 추천 클립 |

#### B. Spring Boot (레거시 참고용)

`backend` 디렉터리의 Spring Boot 애플리케이션은 참고용 구현으로 남겨 두었습니다. H2 인메모리 데이터베이스를 사용하며 아래와 같이 실행할 수 있습니다.

```bash
cd backend
mvn spring-boot:run
```

### 프론트엔드(React + Vite)

`frontend` 디렉터리에는 React 기반 관리 도구가 포함되어 있습니다. Vite 개발 서버는 기본적으로 Cloudflare Workers 로컬 개발 포트(`http://127.0.0.1:8787`)로 API 프록시를 제공합니다. 다른 백엔드 주소를 사용해야 한다면 `VITE_DEV_API_PROXY_TARGET` 환경 변수를 설정해 원하는 URL로 프록시 대상을 변경할 수 있습니다.

```bash
cd frontend
npm install
npm run dev
```

로그인 헤더 값, 아티스트/영상/클립을 순차적으로 등록하고 자동 추천 기능을 실행할 수 있습니다.

#### Cloudflare Pages 배포

- 루트 디렉터리에 있는 `package.json`이 Cloudflare Pages에서 `npm install`과 `npm run build`를 실행하면 자동으로 `frontend` 의존성을 설치하고 빌드를 수행하도록 설정되어 있습니다.
- Pages의 **Build command**는 `npm run build`, **Build output directory**는 `frontend/dist`로 지정합니다.
- Cloudflare Pages Functions가 `/api/*` 경로를 워커로 프록시하므로, 기본 설정만으로도 동일 오리진에서 API를 호출할 수 있습니다. 다른 백엔드 엔드포인트를 사용하려면 `VITE_API_BASE_URL` 환경 변수를 재정의하세요.

##### 배포 후 기본 점검(404 또는 1016 오류 대응)

1. **Latest deployment 상태 확인** – Cloudflare Pages 프로젝트의 `Deployments` 탭에서 최근 배포가 `Success`인지 확인합니다. 실패했다면 로그 하단에 표시되는 오류(예: `npm run build` 실패, 의존성 설치 실패 등)를 먼저 해결해야 합니다.
2. **Build output directory 경로 검증** – 배포 로그에 `frontend/dist/index.html`이 업로드 대상으로 표시되는지 확인합니다. 경로가 비어 있으면 Pages가 404를 반환합니다. 루트에 `dist`만 업로드된 경우에는 Build output directory 설정을 `frontend/dist`로 다시 저장한 뒤 재배포하세요.
3. **환경 변수 노출 여부 확인** – Vite는 런타임이 아닌 빌드 타임에 환경 변수를 주입하므로, `VITE_` prefix가 붙은 값(`VITE_API_BASE_URL` 등)이 Pages 프로젝트의 **Environment variables**에 설정되어 있고 최신 배포에서 해당 값을 사용했는지 확인합니다. 값이 비어 있으면 API 호출이 실패하며 빈 화면으로 보일 수 있습니다.
4. **커스텀 도메인 DNS 검사** – `HTTP ERROR 1016`이 발생하는 경우, Pages의 기본 도메인(`*.pages.dev`)과 별도로 연결한 커스텀 도메인의 CNAME 레코드가 `cname.pages.dev`를 가리키는지, 그리고 Cloudflare DNS가 활성화(주황색 구름) 상태인지 확인하세요. DNS가 잘못된 원본을 가리키면 Cloudflare가 페이지를 찾지 못합니다.
5. **캐시 초기화** – 설정을 수정한 뒤에도 이전 404 응답이 캐시돼 있을 수 있으므로 Cloudflare Dashboard의 **Purge Cache** 기능으로 전체 캐시를 비운 후 다시 접속해 봅니다.
6. **프리뷰 환경 점검** – 프로덕션이 비어 있더라도 Pull Request/브랜치 배포(Preview)에서는 페이지가 열리는지 확인합니다. Preview가 정상이라면 프로덕션 환경 전용 환경 변수 또는 DNS 설정만 추가로 확인하면 됩니다.

## 8. Cloudflare Workers 배포

`yt-clip-api` Worker와 D1 데이터베이스를 Cloudflare에 배포하려면 [Cloudflare Workers 배포 가이드](docs/deployment-cloudflare.md)를 참고하세요. Wrangler 로그인, D1 데이터베이스 생성, 마이그레이션 적용, `wrangler deploy`를 통한 프로덕션 배포 절차를 단계별로 정리했습니다.

