import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import ClipPlayer from './components/ClipPlayer';
import GoogleLoginButton from './components/GoogleLoginButton';

type MaybeArray<T> =
  | T[]
  | { items?: T[]; data?: T[]; results?: T[] }
  | null
  | undefined;

const ensureArray = <T,>(value: MaybeArray<T>): T[] => {
  if (Array.isArray(value)) {
    return value;
  }
  if (value && typeof value === 'object') {
    const container = value as { items?: T[]; data?: T[]; results?: T[] };
    if (Array.isArray(container.items)) {
      return container.items;
    }
    if (Array.isArray(container.data)) {
      return container.data;
    }
    if (Array.isArray(container.results)) {
      return container.results;
    }
  }
  return [];
};

interface ArtistResponse {
  id: number;
  name: string;
  displayName: string;
  youtubeChannelId: string;
}

interface VideoResponse {
  id: number;
  artistId: number;
  youtubeVideoId: string;
  title: string;
  durationSec?: number;
  thumbnailUrl?: string;
  channelId?: string;
}

interface ClipResponse {
  id: number;
  videoId: number;
  title: string;
  startSec: number;
  endSec: number;
  tags: string[];
  youtubeVideoId?: string;
  videoTitle?: string | null;
}

interface ClipCandidateResponse {
  startSec: number;
  endSec: number;
  score: number;
  label: string;
}

type ClipLike = Omit<ClipResponse, 'tags'> & { tags?: unknown };

const normalizeClip = (clip: ClipLike): ClipResponse => {
  const rawTags = clip.tags;
  const normalizedTags = Array.isArray(rawTags)
    ? rawTags.filter((tag): tag is string => typeof tag === 'string')
    : typeof rawTags === 'string'
      ? rawTags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean)
      : [];

  return {
    ...clip,
    tags: normalizedTags,
    videoTitle: clip.videoTitle ?? null
  };
};

const allowCrossOriginApi = String(import.meta.env.VITE_ALLOW_CROSS_ORIGIN_API ?? '')
  .toLowerCase()
  .trim() === 'true';

const normalizeApiBase = (base: string): string => {
  if (!base) {
    return '/api';
  }

  const trimmed = base.trim().replace(/\/+$/, '');

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
  }

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.endsWith('/api') ? withLeadingSlash : `${withLeadingSlash}/api`;
};

const resolveApiBaseUrl = () => {
  const rawBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  const fallback = normalizeApiBase('/api');

  if (!rawBase) {
    return fallback;
  }

  const normalized = normalizeApiBase(rawBase);

  if (allowCrossOriginApi) {
    return normalized;
  }

  if (typeof window !== 'undefined') {
    try {
      const parsed = new URL(normalized, window.location.origin);
      if (parsed.origin !== window.location.origin && /^https?:$/.test(parsed.protocol)) {
        console.warn(
          '[yt-clip] Cross-origin API base URL detected. Falling back to same-origin /api proxy to avoid Cloudflare preflight blocks.'
        );
        return fallback;
      }
    } catch (error) {
      console.warn('[yt-clip] Failed to parse API base URL, defaulting to same-origin /api.', error);
      return fallback;
    }
  }

  return normalized;
};

const http = axios.create({
  baseURL: resolveApiBaseUrl()
});

interface GoogleIdTokenPayload {
  email?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
}

const decodeGoogleToken = (token: string): GoogleIdTokenPayload | null => {
  try {
    const [, payload] = token.split('.');
    if (!payload) {
      return null;
    }
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
    const decoded = atob(normalized + padding);
    return JSON.parse(decoded) as GoogleIdTokenPayload;
  } catch (error) {
    console.error('Failed to decode Google token', error);
    return null;
  }
};

export default function App() {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [artists, setArtists] = useState<ArtistResponse[]>([]);
  const [videos, setVideos] = useState<VideoResponse[]>([]);
  const [clips, setClips] = useState<ClipResponse[]>([]);
  const [publicClips, setPublicClips] = useState<ClipResponse[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<number | null>(null);
  const [clipCandidates, setClipCandidates] = useState<ClipCandidateResponse[]>([]);
  const [artistForm, setArtistForm] = useState({ name: '', channelId: '' });
  const [videoForm, setVideoForm] = useState({ url: '', artistId: '', description: '', captionsJson: '' });
  const [clipForm, setClipForm] = useState({ title: '', startSec: 0, endSec: 0, tags: '' });
  const [autoDetectMode, setAutoDetectMode] = useState('chapters');
  const [idToken, setIdToken] = useState<string | null>(null);
  const [isGoogleReady, setIsGoogleReady] = useState(false);

  const authHeaders = useMemo(
    () => ({
      'X-User-Email': email,
      'X-User-Name': displayName
    }),
    [email, displayName]
  );

  const isAuthenticated = Boolean(idToken);
  const creationDisabled = !isAuthenticated;

  useEffect(() => {
    if (window.google?.accounts?.id) {
      setIsGoogleReady(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => setIsGoogleReady(true);
    script.onerror = () => {
      console.error('Failed to load Google Identity Services script');
    };
    document.head.appendChild(script);

    return () => {
      script.remove();
    };
  }, []);

  const handleGoogleCredential = useCallback((credential: string) => {
    const payload = decodeGoogleToken(credential);
    if (!payload?.email) {
      console.error('Google credential did not include an email address');
      return;
    }
    setEmail(payload.email);
    setDisplayName(payload.name ?? payload.email);
    setIdToken(credential);
  }, []);

  const handleSignOut = () => {
    setIdToken(null);
    setEmail('');
    setDisplayName('');
    setArtists([]);
    setVideos([]);
    setClips([]);
    setPublicClips([]);
    setClipCandidates([]);
    setSelectedVideo(null);
    setVideoForm({ url: '', artistId: '', description: '', captionsJson: '' });
    setClipForm({ title: '', startSec: 0, endSec: 0, tags: '' });
  };

  const fetchArtists = useCallback(async () => {
    if (!isAuthenticated) {
      setArtists([]);
      return;
    }
    try {
      const response = await http.get<ArtistResponse[]>('/artists', { headers: authHeaders });
      setArtists(ensureArray(response.data));
    } catch (error) {
      console.error('Failed to load artists', error);
      setArtists([]);
    }
  }, [authHeaders, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      setArtists([]);
      setVideos([]);
      setClips([]);
      setClipCandidates([]);
      setSelectedVideo(null);
      return;
    }
    void fetchArtists();
  }, [isAuthenticated, fetchArtists]);

  const handleArtistSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (creationDisabled) {
      console.warn('Authentication is required to create artists.');
      return;
    }
    try {
      await http.post<ArtistResponse>(
        '/artists',
        { name: artistForm.name, displayName: artistForm.name, youtubeChannelId: artistForm.channelId },
        { headers: authHeaders }
      );
      setArtistForm({ name: '', channelId: '' });
      await fetchArtists();
    } catch (error) {
      console.error('Failed to create artist', error);
    }
  };

  const handleVideoSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (creationDisabled) {
      console.warn('Authentication is required to register videos.');
      return;
    }
    try {
      const response = await http.post<VideoResponse>(
        '/videos',
        {
          videoUrl: videoForm.url,
          artistId: Number(videoForm.artistId),
          description: videoForm.description,
          captionsJson: videoForm.captionsJson
        },
        { headers: authHeaders }
      );
      setVideos((prev) => {
        const otherVideos = prev.filter((video) => video.id !== response.data.id);
        return [...otherVideos, response.data];
      });
      setSelectedVideo(response.data.id);
      setVideoForm((prev) => ({ ...prev, url: '', description: '', captionsJson: '' }));
    } catch (error) {
      console.error('Failed to save video', error);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      setClips([]);
      return;
    }
    if (!selectedVideo) {
      setClips([]);
      return;
    }

    setClipCandidates([]);

    (async () => {
      try {
        const response = await http.get<ClipResponse[]>('/clips', {
          headers: authHeaders,
          params: { videoId: selectedVideo }
        });
        setClips(ensureArray(response.data).map(normalizeClip));
      } catch (error) {
        console.error('Failed to load clips', error);
        setClips([]);
      }
    })();
  }, [selectedVideo, authHeaders, isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      setPublicClips([]);
      return;
    }

    (async () => {
      try {
        const response = await http.get<ClipResponse[]>('/public/clips');
        setPublicClips(ensureArray(response.data).map(normalizeClip));
      } catch (error) {
        console.error('Failed to load public clips', error);
        setPublicClips([]);
      }
    })();
  }, [isAuthenticated]);

  const handleClipSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (creationDisabled) {
      console.warn('Authentication is required to create clips.');
      return;
    }
    if (!selectedVideo) {
      return;
    }
    try {
      const response = await http.post<ClipResponse>(
        '/clips',
        {
          videoId: selectedVideo,
          title: clipForm.title,
          startSec: Number(clipForm.startSec),
          endSec: Number(clipForm.endSec),
          tags: clipForm.tags
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean)
        },
        { headers: authHeaders }
      );
      setClips((prev) => [...prev, normalizeClip(response.data)]);
      setClipForm({ title: '', startSec: 0, endSec: 0, tags: '' });
    } catch (error) {
      console.error('Failed to create clip', error);
    }
  };

  const runAutoDetect = async () => {
    if (!selectedVideo) {
      return;
    }
    if (creationDisabled) {
      console.warn('Authentication is required to run auto-detection.');
      return;
    }
    try {
      const response = await http.post<ClipCandidateResponse[]>(
        '/clips/auto-detect',
        { videoId: selectedVideo, mode: autoDetectMode },
        { headers: authHeaders }
      );
      setClipCandidates(ensureArray(response.data));
    } catch (error) {
      console.error('Failed to auto-detect clips', error);
      setClipCandidates([]);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      setVideos([]);
      setSelectedVideo(null);
      setClips([]);
      setClipCandidates([]);
      return;
    }
    if (!videoForm.artistId) {
      setVideos([]);
      setSelectedVideo(null);
      setClips([]);
      setClipCandidates([]);
      return;
    }

    (async () => {
      try {
        const response = await http.get<VideoResponse[]>('/videos', {
          headers: authHeaders,
          params: { artistId: Number(videoForm.artistId) }
        });

        const fetchedVideos = ensureArray(response.data);
        setVideos(fetchedVideos);
        setSelectedVideo((previous) => {
          if (previous && fetchedVideos.some((video) => video.id === previous)) {
            return previous;
          }
          return fetchedVideos.length > 0 ? fetchedVideos[0].id : null;
        });
      } catch (error) {
        console.error('Failed to load videos', error);
        setVideos([]);
        setSelectedVideo(null);
      }
    })();
  }, [videoForm.artistId, authHeaders, isAuthenticated]);

  const handleArtistClick = (artistId: number) => {
    if (creationDisabled) {
      return;
    }
    setVideoForm((prev) => ({ ...prev, artistId: String(artistId) }));
  };

  const selectedArtist = artists.find((artist) => artist.id === Number(videoForm.artistId));
  const selectedVideoData = selectedVideo ? videos.find((video) => video.id === selectedVideo) : null;
  const displayedClips = isAuthenticated ? clips : publicClips;
  const playlistHeading = isAuthenticated ? '유저가 저장한 플레이리스트' : '공개된 클립 모음';
  const playlistSubtitle = isAuthenticated
    ? '(백그라운드 재생)'
    : '로그인 없이 감상 가능한 클립 모음';
  const playlistEmptyMessage = isAuthenticated
    ? '선택된 영상의 저장된 클립이 없습니다.'
    : '공개된 클립이 아직 없습니다.';

  return (
    <div className="dashboard">
      <div className="left-column">
        <section className="panel login-panel">
          <div>
            <h1>로그인 (유저정보)</h1>
            <p>Google 계정으로 로그인하면 API 요청에 사용자 정보가 자동으로 포함됩니다.</p>
          </div>
          <div className="login-status">
            {isAuthenticated ? (
              <div className="login-status__row">
                <span className="login-status__message">구글 계정으로 로그인되었습니다.</span>
                <button type="button" onClick={handleSignOut} className="login-status__button">
                  로그아웃
                </button>
              </div>
            ) : (
              <div className="login-status__row">
                {isGoogleReady ? (
                  <GoogleLoginButton
                    clientId="245943329145-os94mkp21415hadulir67v1i0lqjrcnq.apps.googleusercontent.com"
                    onCredential={handleGoogleCredential}
                  />
                ) : (
                  <span className="login-status__message">구글 로그인 준비 중...</span>
                )}
              </div>
            )}
          </div>
          <label htmlFor="email">이메일</label>
          <input id="email" value={email} readOnly placeholder="로그인 후 자동 입력" />
          <label htmlFor="displayName">표시 이름</label>
          <input id="displayName" value={displayName} readOnly placeholder="로그인 후 자동 입력" />
          <button type="button" onClick={fetchArtists} disabled={!isAuthenticated}>
            나의 아티스트 새로고침
          </button>
        </section>

        <section className="panel artists-panel">
          <div className="section-heading">
            <h2>등록된 아티스트</h2>
            <p>선택한 아티스트의 영상과 노래를 중앙 영역에서 관리할 수 있습니다.</p>
          </div>
          <form onSubmit={handleArtistSubmit} className="stacked-form">
            <input
              id="artistName"
              placeholder="아티스트 이름"
              value={artistForm.name}
              onChange={(event) => setArtistForm((prev) => ({ ...prev, name: event.target.value }))}
              required
              disabled={creationDisabled}
            />
            <input
              id="artistChannel"
              placeholder="YouTube 채널 ID"
              value={artistForm.channelId}
              onChange={(event) => setArtistForm((prev) => ({ ...prev, channelId: event.target.value }))}
              required
              disabled={creationDisabled}
            />
            <button type="submit" disabled={creationDisabled}>
              아티스트 등록
            </button>
          </form>
          <ul className="artist-list">
            {artists.length === 0 && <li className="artist-empty">등록된 아티스트가 없습니다.</li>}
            {artists.map((artist) => {
              const isActive = Number(videoForm.artistId) === artist.id;
              return (
                <li
                  key={artist.id}
                  className={`artist-card${isActive ? ' active' : ''}`}
                  onClick={() => handleArtistClick(artist.id)}
                >
                  <span className="artist-name">{artist.displayName || artist.name}</span>
                  <span className="artist-channel">{artist.youtubeChannelId}</span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <section className="panel media-panel">
        <header>
          <h2>아티스트에 대해 등록된 영상 및 노래</h2>
          <p>
            {selectedArtist
              ? `${selectedArtist.displayName || selectedArtist.name} 아티스트의 콘텐츠를 등록하고 자동으로 하이라이트를 추출하세요.`
              : '왼쪽에서 아티스트를 선택하면 영상과 노래를 등록할 수 있습니다.'}
          </p>
        </header>
        <div className="media-layout">
          <div className="media-card">
            <h3>영상 등록</h3>
            <form onSubmit={handleVideoSubmit} className="stacked-form">
              <input
                id="videoUrl"
                placeholder="YouTube 영상 URL"
                value={videoForm.url}
                onChange={(event) => setVideoForm((prev) => ({ ...prev, url: event.target.value }))}
                required
                disabled={creationDisabled}
              />
              <select
                id="artistSelect"
                value={videoForm.artistId}
                onChange={(event) => setVideoForm((prev) => ({ ...prev, artistId: event.target.value }))}
                required
                disabled={creationDisabled}
              >
                <option value="" disabled>
                  아티스트 선택
                </option>
                {artists.map((artist) => (
                  <option key={artist.id} value={artist.id}>
                    {artist.displayName || artist.name}
                  </option>
                ))}
              </select>
              <textarea
                id="description"
                rows={3}
                placeholder="영상 설명 (선택 사항)"
                value={videoForm.description}
                onChange={(event) => setVideoForm((prev) => ({ ...prev, description: event.target.value }))}
                disabled={creationDisabled}
              />
              <textarea
                id="captions"
                rows={3}
                placeholder="캡션 JSON 또는 시작시간|문장 형식"
                value={videoForm.captionsJson}
                onChange={(event) => setVideoForm((prev) => ({ ...prev, captionsJson: event.target.value }))}
                disabled={creationDisabled}
              />
              <button type="submit" disabled={creationDisabled}>
                영상 메타데이터 저장
              </button>
            </form>
          </div>

          <div className="media-card">
            <h3>클립 생성 및 자동 감지</h3>
            <form onSubmit={handleClipSubmit} className="stacked-form">
              <select
                id="videoSelect"
                value={selectedVideo ?? ''}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setSelectedVideo(Number.isNaN(value) ? null : value);
                }}
                required
                disabled={creationDisabled}
              >
                <option value="" disabled>
                  영상 선택
                </option>
                {videos.map((video) => (
                  <option key={video.id} value={video.id}>
                    {video.title || video.youtubeVideoId}
                  </option>
                ))}
              </select>
              <input
                id="clipTitle"
                placeholder="클립 제목"
                value={clipForm.title}
                onChange={(event) => setClipForm((prev) => ({ ...prev, title: event.target.value }))}
                required
                disabled={creationDisabled}
              />
              <div className="number-row">
                <input
                  id="startSec"
                  type="number"
                  min={0}
                  placeholder="시작 (초)"
                  value={clipForm.startSec}
                  onChange={(event) =>
                    setClipForm((prev) => ({ ...prev, startSec: Number(event.target.value) }))
                  }
                  required
                  disabled={creationDisabled}
                />
                <input
                  id="endSec"
                  type="number"
                  min={0}
                  placeholder="종료 (초)"
                  value={clipForm.endSec}
                  onChange={(event) => setClipForm((prev) => ({ ...prev, endSec: Number(event.target.value) }))}
                  required
                  disabled={creationDisabled}
                />
              </div>
              <input
                id="clipTags"
                placeholder="태그 (쉼표로 구분)"
                value={clipForm.tags}
                onChange={(event) => setClipForm((prev) => ({ ...prev, tags: event.target.value }))}
                disabled={creationDisabled}
              />
              <button type="submit" disabled={creationDisabled}>
                클립 저장
              </button>
            </form>
            <div className="auto-detect">
              <div className="number-row">
                <select
                  id="detectVideo"
                  value={selectedVideo ?? ''}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setSelectedVideo(Number.isNaN(value) ? null : value);
                  }}
                  disabled={creationDisabled}
                >
                  <option value="" disabled>
                    영상 선택
                  </option>
                  {videos.map((video) => (
                    <option key={video.id} value={video.id}>
                      {video.title || video.youtubeVideoId}
                    </option>
                  ))}
                </select>
                <select
                  id="mode"
                  value={autoDetectMode}
                  onChange={(event) => setAutoDetectMode(event.target.value)}
                  disabled={creationDisabled}
                >
                  <option value="chapters">챕터 기반</option>
                  <option value="captions">자막 기반</option>
                  <option value="combined">혼합</option>
                </select>
              </div>
              <button type="button" onClick={runAutoDetect} disabled={creationDisabled}>
                자동으로 클립 제안 받기
              </button>
            </div>
          </div>
        </div>

        <div className="media-card full">
          <h3>등록된 영상</h3>
          {videos.length === 0 ? (
            <p className="empty-state">선택된 아티스트의 영상이 아직 없습니다.</p>
          ) : (
            <ul className="video-list">
              {videos.map((video) => {
                const isActive = selectedVideo === video.id;
                return (
                  <li
                    key={video.id}
                    className={`video-item${isActive ? ' active' : ''}`}
                    onClick={() => setSelectedVideo(video.id)}
                  >
                    <div>
                      <h4>{video.title || video.youtubeVideoId}</h4>
                      <p>{video.youtubeVideoId}</p>
                    </div>
                    {video.thumbnailUrl && <img src={video.thumbnailUrl} alt="Video thumbnail" />}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {clipCandidates.length > 0 && (
          <div className="media-card full">
            <h3>자동 감지된 클립 제안</h3>
            <div className="candidate-grid">
              {clipCandidates.map((candidate, index) => (
                <div className="candidate-card" key={`${candidate.startSec}-${candidate.endSec}-${index}`}>
                  <div>
                    <h4>{candidate.label || `세그먼트 ${index + 1}`}</h4>
                    <p>
                      {candidate.startSec}s → {candidate.endSec}s (신뢰도 {(candidate.score * 100).toFixed(0)}%)
                    </p>
                  </div>
                  {selectedVideoData && (
                    <ClipPlayer
                      youtubeVideoId={selectedVideoData.youtubeVideoId}
                      startSec={candidate.startSec}
                      endSec={candidate.endSec}
                      autoplay={false}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="panel playlist-panel">
        <div>
          <h2>{playlistHeading}</h2>
          <p className="playlist-subtitle">{playlistSubtitle}</p>
        </div>
        {displayedClips.length === 0 ? (
          <p className="empty-state">{playlistEmptyMessage}</p>
        ) : (
          <div className="playlist-list">
            {displayedClips.map((clip) => {
              const clipVideo = videos.find((video) => video.id === clip.videoId);
              const youtubeVideoId = clip.youtubeVideoId ?? clipVideo?.youtubeVideoId;
              const resolvedVideoTitle =
                clip.videoTitle ?? clipVideo?.title ?? clipVideo?.youtubeVideoId ?? '';
              return (
                <div className="playlist-card" key={clip.id}>
                  <div className="playlist-meta">
                    <h3>{clip.title}</h3>
                    <p>
                      {clip.startSec}s → {clip.endSec}s
                    </p>
                    {resolvedVideoTitle && (
                      <p className="playlist-video-title">{resolvedVideoTitle}</p>
                    )}
                    {clip.tags.length > 0 && (
                      <div className="tag-row">
                        {clip.tags.map((tag) => (
                          <span key={tag} className="tag">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {youtubeVideoId && (
                    <ClipPlayer
                      youtubeVideoId={youtubeVideoId}
                      startSec={clip.startSec}
                      endSec={clip.endSec}
                      autoplay={false}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
