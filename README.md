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

