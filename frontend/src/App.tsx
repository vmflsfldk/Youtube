import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import ClipPlayer from './components/ClipPlayer';
import GoogleLoginButton from './components/GoogleLoginButton';
import SignupPopup from './components/SignupPopup';

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

const formatSeconds = (value: number): string => {
  if (!Number.isFinite(value) || value < 0) {
    return '0:00';
  }
  const total = Math.floor(value);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const minutePart = minutes.toString().padStart(2, '0');
  const secondPart = seconds.toString().padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${minutePart}:${secondPart}`;
  }
  return `${minutes}:${secondPart}`;
};

const describeSectionSource = (source?: string): string => {
  switch ((source ?? '').toUpperCase()) {
    case 'COMMENT':
      return '댓글';
    case 'VIDEO_DESCRIPTION':
      return '영상 설명';
    case 'YOUTUBE_CHAPTER':
      return '유튜브 챕터';
    default:
      return '기타';
  }
};

const describeVideoContentType = (contentType?: string): string => {
  switch ((contentType ?? '').toUpperCase()) {
    case 'CLIP_SOURCE':
      return '라이브';
    case 'OFFICIAL':
      return '공식';
    default:
      return '기타';
  }
};

const isClipSourceVideo = (video: VideoResponse): boolean =>
  (video.contentType ?? '').toUpperCase() === 'CLIP_SOURCE';

type MediaRegistrationType = 'video' | 'clip';

const resolveMediaRegistrationType = (url: string, selectedVideoId: number | null): MediaRegistrationType => {
  const normalized = url.trim().toLowerCase();
  const isWatchLink = normalized.includes('watch');
  if (isWatchLink) {
    return 'clip';
  }
  if (normalized.length > 0) {
    return 'video';
  }
  return selectedVideoId !== null ? 'clip' : 'video';
};

const VIDEO_FILTER_KEYWORDS = ['cover', 'original', 'official'];

type ArtistCountryKey = 'availableKo' | 'availableEn' | 'availableJp';

const parseTags = (value: string): string[] =>
  value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);

const ARTIST_COUNTRY_METADATA: ReadonlyArray<{
  key: ArtistCountryKey;
  code: string;
  label: string;
}> = [
  { key: 'availableKo', code: 'KO', label: '한국' },
  { key: 'availableEn', code: 'EN', label: '영어권' },
  { key: 'availableJp', code: 'JP', label: '일본' }
];

const AUTH_TOKEN_STORAGE_KEY = 'yt-clip.auth-token';
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;

interface ArtistResponse {
  id: number;
  name: string;
  displayName: string;
  youtubeChannelId: string;
  youtubeChannelTitle?: string | null;
  profileImageUrl?: string | null;
  availableKo: boolean;
  availableEn: boolean;
  availableJp: boolean;
  tags: string[];
}

interface VideoSectionResponse {
  title: string;
  startSec: number;
  endSec: number;
  source: string;
}

interface VideoResponse {
  id: number;
  artistId: number;
  youtubeVideoId: string;
  title: string;
  durationSec?: number;
  thumbnailUrl?: string;
  channelId?: string;
  contentType?: 'OFFICIAL' | 'CLIP_SOURCE' | string;
  sections?: VideoSectionResponse[];
  hidden?: boolean;
}

interface ClipResponse {
  id: number;
  videoId: number | null;
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

type ClipCreationPayload = {
  title: string;
  startSec: number;
  endSec: number;
  tags: string[];
  videoId?: number;
  videoUrl?: string;
  artistId?: number;
  videoHidden?: boolean;
};

type ArtistFormState = {
  name: string;
  channelId: string;
  countries: {
    ko: boolean;
    en: boolean;
    jp: boolean;
  };
};

const resolveArtistCountryBadges = (artist: ArtistResponse) =>
  ARTIST_COUNTRY_METADATA.filter((country) => artist[country.key])
    .map((country) => ({ code: country.code, label: country.label }));

const createInitialArtistFormState = (): ArtistFormState => ({
  name: '',
  channelId: '',
  countries: {
    ko: true,
    en: false,
    jp: false
  }
});

interface ArtistPreviewDebug {
  input: string;
  identifier: {
    channelId: string | null;
    username: string | null;
    handle: string | null;
  };
  htmlCandidates: string[];
  attemptedHtml: boolean;
  attemptedApi: boolean;
  apiStatus: number | null;
  usedHtmlFallback: boolean;
  usedApi: boolean;
  htmlChannelId: string | null;
  htmlTitle: string | null;
  htmlThumbnail: string | null;
  resolvedChannelId: string | null;
  warnings: string[];
  videoFetchAttempted?: boolean;
  videoFetchStatus?: number | null;
  videoFilterKeywords?: string[];
  filteredVideoCount?: number;
  videoFetchError?: string | null;
}

interface ArtistPreviewVideo {
  videoId: string;
  title: string | null;
  thumbnailUrl: string | null;
  url: string;
  publishedAt: string | null;
}

interface ArtistPreviewResponse {
  channelId: string | null;
  profileImageUrl: string | null;
  title: string | null;
  channelUrl: string | null;
  debug: ArtistPreviewDebug | null;
  videos?: ArtistPreviewVideo[];
}

type ArtistDebugLogEntryType = 'preview-success' | 'preview-error' | 'create-success' | 'create-error';

interface ArtistDebugLogEntry {
  id: string;
  timestamp: string;
  type: ArtistDebugLogEntryType;
  request: {
    channelId: string;
    name?: string;
  };
  response?: unknown;
  error?: string;
}

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

type SectionKey = 'library' | 'management' | 'playlist' | 'mypage';

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

const resolveAuthBaseUrl = () => resolveApiBaseUrl().replace(/\/api$/, '/auth');

const authHttp = axios.create({
  baseURL: resolveAuthBaseUrl()
});

interface GoogleIdTokenPayload {
  email?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
}

interface UserResponse {
  id: number;
  email: string;
  displayName: string | null;
}

type EmailRegisterPhase = 'idle' | 'code-sent';

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
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<UserResponse | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(false);
  const [artists, setArtists] = useState<ArtistResponse[]>([]);
  const [videos, setVideos] = useState<VideoResponse[]>([]);
  const [hiddenVideoIds, setHiddenVideoIds] = useState<number[]>([]);
  const [favoriteVideoIds, setFavoriteVideoIds] = useState<number[]>([]);
  const [playlistVideoIds, setPlaylistVideoIds] = useState<number[]>([]);
  const [clips, setClips] = useState<ClipResponse[]>([]);
  const [publicClips, setPublicClips] = useState<ClipResponse[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<number | null>(null);
  const [clipCandidates, setClipCandidates] = useState<ClipCandidateResponse[]>([]);
  const [isFetchingVideoSections, setIsFetchingVideoSections] = useState(false);
  const [videoSectionPreview, setVideoSectionPreview] = useState<VideoSectionResponse[]>([]);
  const [videoSectionPreviewError, setVideoSectionPreviewError] = useState<string | null>(null);
  const [hasAttemptedVideoSectionPreview, setHasAttemptedVideoSectionPreview] = useState(false);
  const [isLibraryVideoFormOpen, setLibraryVideoFormOpen] = useState(false);
  const [isLibraryClipFormOpen, setLibraryClipFormOpen] = useState(false);
  const isLibraryMediaFormOpen = isLibraryVideoFormOpen || isLibraryClipFormOpen;
  const [artistForm, setArtistForm] = useState<ArtistFormState>(() => createInitialArtistFormState());
  const [artistSearchQuery, setArtistSearchQuery] = useState('');
  const [artistTagQuery, setArtistTagQuery] = useState('');
  const [videoForm, setVideoForm] = useState({ url: '', artistId: '', description: '', captionsJson: '' });
  const [clipForm, setClipForm] = useState({ title: '', startSec: 0, endSec: 0, tags: '', videoUrl: '' });
  const mediaRegistrationType = useMemo(
    () => resolveMediaRegistrationType(videoForm.url, selectedVideo),
    [videoForm.url, selectedVideo]
  );
  const isClipRegistration = mediaRegistrationType === 'clip';
  const [autoDetectMode, setAutoDetectMode] = useState('chapters');
  const [isArtistVideosLoading, setArtistVideosLoading] = useState(false);
  const [isGoogleReady, setIsGoogleReady] = useState(false);
  const [emailRegisterEmail, setEmailRegisterEmail] = useState('');
  const [emailRegisterCode, setEmailRegisterCode] = useState('');
  const [emailRegisterPassword, setEmailRegisterPassword] = useState('');
  const [artistPreview, setArtistPreview] = useState<{
    inputChannel: string;
    data: ArtistPreviewResponse;
    fetchedAt: string;
  } | null>(null);
  const [artistPreviewReady, setArtistPreviewReady] = useState(false);
  const [isArtistPreviewLoading, setArtistPreviewLoading] = useState(false);
  const [artistPreviewError, setArtistPreviewError] = useState<string | null>(null);
  const [isArtistDebugVisible, setArtistDebugVisible] = useState(false);
  const [artistDebugLog, setArtistDebugLog] = useState<ArtistDebugLogEntry[]>([]);
  const [activeSection, setActiveSection] = useState<SectionKey>('library');
  const [activeClipId, setActiveClipId] = useState<number | null>(null);

  const appendArtistDebugLog = useCallback((entry: Omit<ArtistDebugLogEntry, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setArtistDebugLog((prev) => [{ ...entry, id }, ...prev].slice(0, 50));
  }, []);

  useEffect(() => {
    if (videoForm.url.trim() === '') {
      setVideoSectionPreview([]);
      setVideoSectionPreviewError(null);
      setHasAttemptedVideoSectionPreview(false);
    }
  }, [videoForm.url]);

  useEffect(() => {
    const trimmedChannel = artistForm.channelId.trim();
    if (!artistPreview) {
      setArtistPreviewReady(false);
      return;
    }
    if (artistPreview.inputChannel !== trimmedChannel) {
      setArtistPreview(null);
      setArtistPreviewReady(false);
      setArtistPreviewError(null);
    }
  }, [artistForm.channelId, artistPreview]);

  const artistSubmitLabel = useMemo(() => {
    if (artistPreviewReady && artistPreview) {
      return '아티스트 등록 확정';
    }
    return '아티스트 등록';
  }, [artistPreviewReady, artistPreview]);

  const artistPreviewSource = useMemo(() => {
    const debug = artistPreview?.data.debug;
    if (!debug) {
      return null;
    }
    if (debug.usedApi) {
      return 'YouTube Data API';
    }
    if (debug.usedHtmlFallback) {
      return '채널 페이지 HTML';
    }
    return '사용자 입력';
  }, [artistPreview]);

  const previewVideos = useMemo(() => {
    if (!artistPreview?.data?.videos) {
      return [] as ArtistPreviewVideo[];
    }
    return artistPreview.data.videos.slice(0, 12);
  }, [artistPreview]);

  const filteredArtists = useMemo((): ArtistResponse[] => {
    const nameQuery = artistSearchQuery.trim().toLowerCase();
    const tagQuery = artistTagQuery.trim().toLowerCase();
    if (!nameQuery && !tagQuery) {
      return artists;
    }

    return artists.filter((artist) => {
      const searchableFields = [
        artist.name,
        artist.displayName,
        artist.youtubeChannelId,
        artist.youtubeChannelTitle ?? undefined
      ]
        .filter((value): value is string => Boolean(value && value.trim()))
        .map((value) => value.toLowerCase());
      const tags = Array.isArray(artist.tags)
        ? artist.tags.map((tag) => tag.toLowerCase())
        : [];

      const matchesName = !nameQuery || searchableFields.some((value) => value.includes(nameQuery));
      const matchesTag = !tagQuery || tags.some((tag) => tag.includes(tagQuery));

      return matchesName && matchesTag;
    });
  }, [artistSearchQuery, artistTagQuery, artists]);

  const previewVideoKeywords = useMemo(() => {
    const rawKeywords = artistPreview?.data?.debug?.videoFilterKeywords ?? [];
    if (!Array.isArray(rawKeywords) || rawKeywords.length === 0) {
      return VIDEO_FILTER_KEYWORDS;
    }
    const normalized = rawKeywords
      .filter((keyword): keyword is string => typeof keyword === 'string' && keyword.trim().length > 0)
      .map((keyword) => keyword.trim());
    if (normalized.length === 0) {
      return VIDEO_FILTER_KEYWORDS;
    }
    return Array.from(new Set(normalized));
  }, [artistPreview]);

  const formatDebugLabel = useCallback((type: ArtistDebugLogEntryType) => {
    switch (type) {
      case 'preview-success':
        return '미리보기 성공';
      case 'preview-error':
        return '미리보기 실패';
      case 'create-success':
        return '등록 성공';
      case 'create-error':
        return '등록 실패';
      default:
        return type;
    }
  }, []);

  const formatTimestamp = useCallback((iso: string) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return iso;
    }
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
  }, []);
  const formatPreviewVideoDate = useCallback((iso: string | null | undefined) => {
    if (!iso) {
      return null;
    }
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
  }, []);
  const [emailRegisterPasswordConfirm, setEmailRegisterPasswordConfirm] = useState('');
  const [emailRegisterPhase, setEmailRegisterPhase] = useState<EmailRegisterPhase>('idle');
  const [emailRegisterMessage, setEmailRegisterMessage] = useState<string | null>(null);
  const [emailRegisterError, setEmailRegisterError] = useState<string | null>(null);
  const [emailRegisterDebugCode, setEmailRegisterDebugCode] = useState<string | null>(null);
  const [passwordLoginEmail, setPasswordLoginEmail] = useState('');
  const [passwordLoginPassword, setPasswordLoginPassword] = useState('');
  const [passwordLoginMessage, setPasswordLoginMessage] = useState<string | null>(null);
  const [passwordLoginError, setPasswordLoginError] = useState<string | null>(null);
  const [isSignupPopupOpen, setSignupPopupOpen] = useState(false);
  const [passwordChangeCurrent, setPasswordChangeCurrent] = useState('');
  const [passwordChangeNew, setPasswordChangeNew] = useState('');
  const [passwordChangeConfirm, setPasswordChangeConfirm] = useState('');
  const [passwordChangeStatus, setPasswordChangeStatus] = useState<string | null>(null);
  const [passwordChangeError, setPasswordChangeError] = useState<string | null>(null);
  const [nicknameInput, setNicknameInput] = useState('');
  const [nicknameStatus, setNicknameStatus] = useState<string | null>(null);
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [activeManagementTab, setActiveManagementTab] = useState<'media' | 'artists'>('media');
  const inactivityTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);

  const authHeaders = useMemo(() => {
    if (!authToken) {
      return {} as Record<string, string>;
    }
    const headers: Record<string, string> = {
      Authorization: `Bearer ${authToken}`
    };
    return headers;
  }, [authToken]);

  const closeSignupPopup = useCallback(() => {
    setSignupPopupOpen(false);
    setEmailRegisterPhase('idle');
    setEmailRegisterCode('');
    setEmailRegisterPassword('');
    setEmailRegisterPasswordConfirm('');
    setEmailRegisterMessage(null);
    setEmailRegisterError(null);
    setEmailRegisterDebugCode(null);
  }, []);

  const openSignupPopup = useCallback(() => {
    setEmailRegisterPhase('idle');
    setEmailRegisterMessage(null);
    setEmailRegisterError(null);
    setEmailRegisterDebugCode(null);
    setEmailRegisterCode('');
    setEmailRegisterPassword('');
    setEmailRegisterPasswordConfirm('');
    setSignupPopupOpen(true);
  }, []);

  const isAuthenticated = Boolean(authToken && currentUser);
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
    setAuthToken(credential);
    setEmailRegisterPhase('idle');
    setEmailRegisterMessage(null);
    setEmailRegisterError(null);
    setEmailRegisterDebugCode(null);
    setEmailRegisterCode('');
    setEmailRegisterPassword('');
    setEmailRegisterPasswordConfirm('');
    setPasswordLoginMessage(null);
    setPasswordLoginError(null);
  }, []);

  const handleSignOut = useCallback(() => {
    closeSignupPopup();
    setAuthToken(null);
    setCurrentUser(null);
    setIsLoadingUser(false);
    setArtists([]);
    setVideos([]);
    setClips([]);
    setPublicClips([]);
    setClipCandidates([]);
    setSelectedVideo(null);
    setVideoForm({ url: '', artistId: '', description: '', captionsJson: '' });
    setClipForm({ title: '', startSec: 0, endSec: 0, tags: '', videoUrl: '' });
    setEmailRegisterEmail('');
    setEmailRegisterCode('');
    setEmailRegisterPassword('');
    setEmailRegisterPasswordConfirm('');
    setEmailRegisterPhase('idle');
    setEmailRegisterMessage(null);
    setEmailRegisterError(null);
    setEmailRegisterDebugCode(null);
    setPasswordLoginEmail('');
    setPasswordLoginPassword('');
    setPasswordLoginMessage(null);
    setPasswordLoginError(null);
    setNicknameInput('');
    setNicknameStatus(null);
    setNicknameError(null);
    setPasswordChangeCurrent('');
    setPasswordChangeNew('');
    setPasswordChangeConfirm('');
    setPasswordChangeStatus(null);
    setPasswordChangeError(null);
  }, [closeSignupPopup]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      const storedToken = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
      if (storedToken) {
        setAuthToken(storedToken);
      }
    } catch (error) {
      console.error('Failed to restore auth token from storage', error);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      if (authToken) {
        window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, authToken);
      } else {
        window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
      }
    } catch (error) {
      console.error('Failed to persist auth token to storage', error);
    }
  }, [authToken]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    if (!isAuthenticated) {
      if (inactivityTimeoutRef.current) {
        window.clearTimeout(inactivityTimeoutRef.current);
        inactivityTimeoutRef.current = null;
      }
      return;
    }

    const resetTimer = () => {
      if (inactivityTimeoutRef.current) {
        window.clearTimeout(inactivityTimeoutRef.current);
      }
      inactivityTimeoutRef.current = window.setTimeout(() => {
        handleSignOut();
      }, INACTIVITY_TIMEOUT_MS);
    };

    const handleActivity = () => {
      if (document.hidden) {
        return;
      }
      resetTimer();
    };

    resetTimer();

    const windowEvents: Array<keyof WindowEventMap> = [
      'click',
      'keydown',
      'mousemove',
      'scroll',
      'touchstart'
    ];

    windowEvents.forEach((eventName) => {
      window.addEventListener(eventName, handleActivity);
    });
    document.addEventListener('visibilitychange', handleActivity);

    return () => {
      windowEvents.forEach((eventName) => {
        window.removeEventListener(eventName, handleActivity);
      });
      document.removeEventListener('visibilitychange', handleActivity);
      if (inactivityTimeoutRef.current) {
        window.clearTimeout(inactivityTimeoutRef.current);
        inactivityTimeoutRef.current = null;
      }
    };
  }, [isAuthenticated, handleSignOut]);

  useEffect(() => {
    if (!authToken) {
      setCurrentUser(null);
      setNicknameInput('');
      return;
    }
    let cancelled = false;
    (async () => {
      setIsLoadingUser(true);
      try {
        const response = await http.post<UserResponse>(
          '/users/login',
          null,
          { headers: authHeaders }
        );
        if (!cancelled) {
          setCurrentUser(response.data);
          setNicknameInput(response.data.displayName ?? '');
        }
      } catch (error) {
        console.error('Failed to load user', error);
        if (!cancelled) {
          setCurrentUser(null);
          setAuthToken(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingUser(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authToken, authHeaders]);

  const handleEmailRegisterRequest = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmedEmail = emailRegisterEmail.trim();
      if (!trimmedEmail) {
        setEmailRegisterError('이메일을 입력해주세요.');
        return;
      }
      setEmailRegisterError(null);
      setEmailRegisterMessage(null);
      setEmailRegisterDebugCode(null);
      try {
        const response = await authHttp.post<{ message?: string; debugCode?: string }>(
          '/email/register/request',
          { email: trimmedEmail }
        );
        setEmailRegisterPhase('code-sent');
        setEmailRegisterMessage(response.data.message ?? '인증 코드가 전송되었습니다.');
        if (response.data.debugCode) {
          setEmailRegisterDebugCode(response.data.debugCode);
        }
      } catch (error) {
        console.error('Failed to request email registration code', error);
        if (axios.isAxiosError(error) && error.response?.data && typeof error.response.data === 'object') {
          const data = error.response.data as { error?: string; message?: string };
          setEmailRegisterError(data.error ?? data.message ?? '인증 코드 발송에 실패했습니다.');
        } else {
          setEmailRegisterError('인증 코드 발송에 실패했습니다.');
        }
      }
    },
    [emailRegisterEmail]
  );

  const handleEmailRegisterVerify = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (emailRegisterPhase !== 'code-sent') {
        return;
      }
      const trimmedEmail = emailRegisterEmail.trim();
      const trimmedCode = emailRegisterCode.trim();
      const trimmedPassword = emailRegisterPassword;
      const trimmedConfirm = emailRegisterPasswordConfirm;
      if (!trimmedCode) {
        setEmailRegisterError('인증 코드를 입력해주세요.');
        return;
      }
      if (!trimmedPassword) {
        setEmailRegisterError('비밀번호를 입력해주세요.');
        return;
      }
      if (trimmedPassword !== trimmedConfirm) {
        setEmailRegisterError('비밀번호 확인이 일치하지 않습니다.');
        return;
      }
      setEmailRegisterError(null);
      setEmailRegisterMessage(null);
      setEmailRegisterDebugCode(null);
      try {
        const response = await authHttp.post<{ token: string; user: UserResponse }>(
          '/email/register/verify',
          {
            email: trimmedEmail,
            code: trimmedCode,
            password: trimmedPassword,
            passwordConfirm: trimmedConfirm
          }
        );
        setAuthToken(response.data.token);
        setCurrentUser(response.data.user);
        setNicknameInput(response.data.user.displayName ?? '');
        closeSignupPopup();
      } catch (error) {
        console.error('Failed to verify email registration code', error);
        let message = '회원가입에 실패했습니다.';
        if (axios.isAxiosError(error) && error.response?.data && typeof error.response.data === 'object') {
          const data = error.response.data as { error?: string; message?: string };
          message = data.error ?? data.message ?? message;
        }
        setEmailRegisterError(message);
      }
    },
    [
      emailRegisterPhase,
      emailRegisterEmail,
      emailRegisterCode,
      emailRegisterPassword,
      emailRegisterPasswordConfirm,
      closeSignupPopup
    ]
  );

  const handlePasswordLogin = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmedEmail = passwordLoginEmail.trim();
      if (!trimmedEmail) {
        setPasswordLoginError('이메일을 입력해주세요.');
        return;
      }
      if (!passwordLoginPassword) {
        setPasswordLoginError('비밀번호를 입력해주세요.');
        return;
      }
      setPasswordLoginError(null);
      setPasswordLoginMessage(null);
      try {
        const response = await authHttp.post<{ token: string; user: UserResponse }>(
          '/email/login',
          { email: trimmedEmail, password: passwordLoginPassword }
        );
        setAuthToken(response.data.token);
        setCurrentUser(response.data.user);
        setNicknameInput(response.data.user.displayName ?? '');
        setPasswordLoginMessage('이메일 로그인에 성공했습니다.');
        setPasswordLoginPassword('');
      } catch (error) {
        console.error('Failed to login with email and password', error);
        let message = '로그인에 실패했습니다.';
        if (axios.isAxiosError(error) && error.response?.data && typeof error.response.data === 'object') {
          const data = error.response.data as { error?: string; message?: string };
          message = data.error ?? data.message ?? message;
        }
        setPasswordLoginError(message);
      }
    },
    [passwordLoginEmail, passwordLoginPassword]
  );

  const handlePasswordChangeSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!isAuthenticated) {
        return;
      }

      if (!passwordChangeNew) {
        setPasswordChangeError('새 비밀번호를 입력해주세요.');
        setPasswordChangeStatus(null);
        return;
      }

      if (passwordChangeNew.length < 8) {
        setPasswordChangeError('비밀번호는 8자 이상 입력해주세요.');
        setPasswordChangeStatus(null);
        return;
      }

      if (passwordChangeNew !== passwordChangeConfirm) {
        setPasswordChangeError('비밀번호 확인이 일치하지 않습니다.');
        setPasswordChangeStatus(null);
        return;
      }

      setPasswordChangeError(null);
      setPasswordChangeStatus(null);

      try {
        await http.post(
          '/users/me/password',
          {
            currentPassword: passwordChangeCurrent,
            newPassword: passwordChangeNew,
            confirmPassword: passwordChangeConfirm
          },
          { headers: authHeaders }
        );
        setPasswordChangeStatus('비밀번호가 변경되었습니다.');
        setPasswordChangeCurrent('');
        setPasswordChangeNew('');
        setPasswordChangeConfirm('');
      } catch (error) {
        console.error('Failed to update password', error);
        if (axios.isAxiosError(error) && error.response?.data && typeof error.response.data === 'object') {
          const data = error.response.data as { error?: string; message?: string };
          setPasswordChangeError(data.error ?? data.message ?? '비밀번호 변경에 실패했습니다.');
        } else {
          setPasswordChangeError('비밀번호 변경에 실패했습니다.');
        }
      }
    },
    [
      isAuthenticated,
      passwordChangeConfirm,
      passwordChangeCurrent,
      passwordChangeNew,
      authHeaders
    ]
  );

  const handleNicknameSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!isAuthenticated) {
      return;
    }
    const trimmedNickname = nicknameInput.trim();
    if (!trimmedNickname) {
      setNicknameError('닉네임을 입력해주세요.');
      return;
    }
    if (trimmedNickname.length < 2 || trimmedNickname.length > 20) {
      setNicknameError('닉네임은 2자 이상 20자 이하로 입력해주세요.');
      return;
    }
    setNicknameError(null);
    setNicknameStatus(null);
    try {
      const response = await http.post<UserResponse>(
        '/users/me/nickname',
        { nickname: trimmedNickname },
        { headers: authHeaders }
      );
      setCurrentUser(response.data);
      setNicknameInput(response.data.displayName ?? '');
      setNicknameStatus('닉네임이 저장되었습니다.');
    } catch (error) {
      console.error('Failed to update nickname', error);
      if (axios.isAxiosError(error) && error.response?.data && typeof error.response.data === 'object') {
        const data = error.response.data as { error?: string; message?: string };
        setNicknameError(data.error ?? data.message ?? '닉네임 저장에 실패했습니다.');
      } else {
        setNicknameError('닉네임 저장에 실패했습니다.');
      }
    }
  };

  const fetchArtists = useCallback(async () => {
    try {
      const response = await http.get<ArtistResponse[]>('/artists', {
        headers: authHeaders
      });
      setArtists(ensureArray(response.data));
    } catch (error) {
      console.error('Failed to load artists', error);
      setArtists([]);
    }
  }, [authHeaders]);

  useEffect(() => {
    if (!isAuthenticated) {
      setClips([]);
      setClipCandidates([]);
    }
    void fetchArtists();
  }, [isAuthenticated, fetchArtists]);

  const handleArtistSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (creationDisabled) {
      console.warn('Authentication is required to create artists.');
      return;
    }
    const trimmedName = artistForm.name.trim();
    const trimmedChannelId = artistForm.channelId.trim();
    const { ko, en, jp } = artistForm.countries;
    const hasCountrySelection = ko || en || jp;
    setArtistPreviewError(null);
    if (!trimmedName || !trimmedChannelId) {
      return;
    }
    const requestContext = {
      channelId: trimmedChannelId,
      name: trimmedName,
      countries: { ko, en, jp }
    } as const;
    if (!hasCountrySelection) {
      setArtistPreviewReady(false);
      setArtistPreviewError('서비스 국가를 최소 한 개 이상 선택해주세요.');
      return;
    }

    if (!artistPreviewReady || !artistPreview || artistPreview.inputChannel !== trimmedChannelId) {
      setArtistPreviewLoading(true);
      try {
        const response = await http.post<ArtistPreviewResponse>(
          '/artists/preview',
          { youtubeChannelId: trimmedChannelId },
          { headers: authHeaders }
        );
        const fetchedAt = new Date().toISOString();
        setArtistPreview({ inputChannel: trimmedChannelId, data: response.data, fetchedAt });
        setArtistPreviewReady(true);
        appendArtistDebugLog({
          timestamp: fetchedAt,
          type: 'preview-success',
          request: requestContext,
          response: response.data
        });
      } catch (error) {
        let message = '채널 정보를 불러오지 못했습니다.';
        let responseData: unknown = null;
        if (axios.isAxiosError(error)) {
          responseData = error.response?.data;
          const detail =
            typeof error.response?.data === 'object' && error.response?.data !== null
              ? (error.response?.data as { error?: string; message?: string }).error ||
                (error.response?.data as { error?: string; message?: string }).message
              : null;
          if (typeof detail === 'string' && detail.trim()) {
            message = detail.trim();
          }
        }
        setArtistPreview(null);
        setArtistPreviewReady(false);
        setArtistPreviewError(message);
        appendArtistDebugLog({
          timestamp: new Date().toISOString(),
          type: 'preview-error',
          request: requestContext,
          error: message,
          response: responseData
        });
      } finally {
        setArtistPreviewLoading(false);
      }
      return;
    }

    try {
      const response = await http.post<ArtistResponse>(
        '/artists',
        {
          name: trimmedName,
          displayName: trimmedName,
          youtubeChannelId: trimmedChannelId,
          availableKo: ko,
          availableEn: en,
          availableJp: jp
        },
        { headers: authHeaders }
      );
      setArtistForm(createInitialArtistFormState());
      setArtistPreview(null);
      setArtistPreviewReady(false);
      setArtistPreviewError(null);
      setVideoForm((prev) => ({ ...prev, artistId: String(response.data.id) }));
      appendArtistDebugLog({
        timestamp: new Date().toISOString(),
        type: 'create-success',
        request: requestContext,
        response: response.data
      });
      await fetchArtists();
    } catch (error) {
      console.error('Failed to create artist', error);
      let message = '아티스트 등록에 실패했습니다.';
      let responseData: unknown = null;
      if (axios.isAxiosError(error)) {
        responseData = error.response?.data;
        const detail =
          typeof error.response?.data === 'object' && error.response?.data !== null
            ? (error.response?.data as { error?: string; message?: string }).error ||
              (error.response?.data as { error?: string; message?: string }).message
            : null;
        if (typeof detail === 'string' && detail.trim()) {
          message = detail.trim();
        }
      }
      setArtistPreviewError(message);
      appendArtistDebugLog({
        timestamp: new Date().toISOString(),
        type: 'create-error',
        request: requestContext,
        error: message,
        response: responseData
      });
    }
  };

  const applyPreviewVideoToForm = useCallback(
    (video: ArtistPreviewVideo) => {
      setVideoForm((prev) => ({ ...prev, url: video.url }));
      setClipForm((prev) => ({ ...prev, videoUrl: video.url }));
      setSelectedVideo(null);
      setActiveSection('management');
      setActiveManagementTab('media');
    },
    [setActiveManagementTab, setActiveSection, setClipForm, setSelectedVideo, setVideoForm]
  );

  const handleVideoSectionPreviewFetch = useCallback(async () => {
    if (creationDisabled) {
      console.warn('Authentication is required to preview video sections.');
      return;
    }
    const trimmedUrl = videoForm.url.trim();
    if (!trimmedUrl) {
      setVideoSectionPreviewError('영상 링크를 입력해 주세요.');
      setVideoSectionPreview([]);
      setHasAttemptedVideoSectionPreview(true);
      return;
    }

    setIsFetchingVideoSections(true);
    setVideoSectionPreviewError(null);
    setHasAttemptedVideoSectionPreview(true);

    try {
      const response = await http.get<VideoSectionResponse[]>('/videos/sections/preview', {
        headers: authHeaders,
        params: { videoUrl: trimmedUrl }
      });
      setVideoSectionPreview(ensureArray(response.data));
    } catch (error) {
      console.error('Failed to fetch video sections', error);
      let message = '구간 정보를 불러오지 못했습니다.';
      if (axios.isAxiosError(error)) {
        const data = error.response?.data;
        if (typeof data === 'string' && data.trim()) {
          message = data.trim();
        } else if (data && typeof data === 'object') {
          const { message: messageField, error: errorField } = data as {
            message?: string;
            error?: string;
          };
          const detail = messageField ?? errorField;
          if (detail && detail.trim()) {
            message = detail.trim();
          }
        }
      }
      setVideoSectionPreviewError(message);
      setVideoSectionPreview([]);
    } finally {
      setIsFetchingVideoSections(false);
    }
  }, [authHeaders, creationDisabled, videoForm.url]);

  const reloadArtistVideos = useCallback(
    async (options?: { signal?: AbortSignal }) => {
      const currentArtistId = Number(videoForm.artistId);
      if (!videoForm.artistId || Number.isNaN(currentArtistId)) {
        if (!options?.signal?.aborted) {
          setVideos([]);
          setSelectedVideo(null);
          setArtistVideosLoading(false);
        }
        return;
      }

      if (!options?.signal?.aborted) {
        setArtistVideosLoading(true);
      }

      try {
        const response = await http.get<VideoResponse[]>('/videos', {
          headers: authHeaders,
          params: { artistId: currentArtistId }
        });

        if (options?.signal?.aborted) {
          return;
        }

        const fetchedVideos = ensureArray(response.data);
        setVideos(fetchedVideos);
        setHiddenVideoIds((prev) =>
          prev.filter((id) => !fetchedVideos.some((video) => video.id === id))
        );
      } catch (error) {
        if (options?.signal?.aborted) {
          return;
        }
        console.error('Failed to load videos', error);
        setVideos([]);
        setSelectedVideo(null);
      } finally {
        if (!options?.signal?.aborted) {
          setArtistVideosLoading(false);
        }
      }
    },
    [videoForm.artistId, authHeaders]
  );

  const createClip = useCallback(
    async (payload: ClipCreationPayload, options?: { hiddenSource?: boolean }) => {
      const response = await http.post<ClipResponse>('/clips', payload, { headers: authHeaders });
      const normalizedClip = normalizeClip(response.data);
      setClipForm({ title: '', startSec: 0, endSec: 0, tags: '', videoUrl: '' });
      setVideoForm((prev) => ({ ...prev, url: '' }));
      setClipCandidates([]);
      const responseVideoId = response.data.videoId ?? null;
      if (options?.hiddenSource && responseVideoId !== null) {
        setHiddenVideoIds((prev) =>
          prev.includes(responseVideoId) ? prev : [...prev, responseVideoId]
        );
      }
      if (responseVideoId !== null) {
        if (responseVideoId !== selectedVideo) {
          setSelectedVideo(responseVideoId);
          setClips([normalizedClip]);
        } else {
          setClips((prev) => [...prev, normalizedClip]);
        }
      } else {
        setClips((prev) => [...prev, normalizedClip]);
      }
      reloadArtistVideos().catch((error) => console.error('Failed to refresh videos after clip creation', error));
      return normalizedClip;
    },
    [authHeaders, http, reloadArtistVideos, selectedVideo]
  );

  const applyVideoSectionToClip = useCallback(
    (section: VideoSectionResponse, fallbackTitle: string) => {
      const resolvedTitle = section.title || fallbackTitle;

      setClipForm((prev) => ({
        ...prev,
        title: resolvedTitle,
        startSec: section.startSec,
        endSec: section.endSec
      }));

      const normalizedSource = (section.source ?? '').toUpperCase();
      const trimmedVideoUrl = clipForm.videoUrl.trim();
      const parsedArtistId = Number(videoForm.artistId);
      const hasSelectedVideo = selectedVideo !== null;
      const canCreateWithVideoUrl =
        trimmedVideoUrl.length > 0 && !Number.isNaN(parsedArtistId) && videoForm.artistId !== '';

      const shouldAutoCreate =
        !creationDisabled &&
        normalizedSource === 'COMMENT' &&
        (hasSelectedVideo || canCreateWithVideoUrl);

      if (!shouldAutoCreate) {
        return;
      }

      const tags = parseTags(clipForm.tags);

      const payload: ClipCreationPayload = {
        title: resolvedTitle,
        startSec: section.startSec,
        endSec: section.endSec,
        tags
      };

      let restoreVideoUrl: string | null = null;

      if (hasSelectedVideo) {
        payload.videoId = selectedVideo;
      } else if (canCreateWithVideoUrl) {
        payload.videoUrl = trimmedVideoUrl;
        payload.artistId = parsedArtistId;
        payload.videoHidden = true;
        restoreVideoUrl = trimmedVideoUrl;
      } else {
        return;
      }

      const previousTags = clipForm.tags;

      const creationOptions = restoreVideoUrl ? { hiddenSource: true } : undefined;

      void createClip(payload, creationOptions)
        .catch((error) => {
          console.error('Failed to auto-create clip from comment section', error);
        })
        .finally(() => {
          if (restoreVideoUrl) {
            setVideoForm((prev) => ({ ...prev, url: restoreVideoUrl }));
            setClipForm((prev) => ({ ...prev, videoUrl: restoreVideoUrl, tags: previousTags }));
          } else if (previousTags) {
            setClipForm((prev) => ({ ...prev, tags: previousTags }));
          }
        });
    },
    [clipForm.tags, clipForm.videoUrl, createClip, creationDisabled, selectedVideo, videoForm.artistId]
  );

  const handlePreviewSectionApply = useCallback(
    (section: VideoSectionResponse, index: number) => {
      applyVideoSectionToClip(section, section.title || `구간 ${index + 1}`);
    },
    [applyVideoSectionToClip]
  );

  const submitVideo = useCallback(async () => {
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
      setVideoSectionPreview([]);
      setVideoSectionPreviewError(null);
      setHasAttemptedVideoSectionPreview(false);
      setVideoForm((prev) => ({ ...prev, url: '', description: '', captionsJson: '' }));
      setClipForm((prev) => ({ ...prev, videoUrl: '' }));
      reloadArtistVideos().catch((error) => console.error('Failed to refresh videos after save', error));
    } catch (error) {
      console.error('Failed to save video', error);
    }
  }, [
    creationDisabled,
    http,
    videoForm.url,
    videoForm.artistId,
    videoForm.description,
    videoForm.captionsJson,
    authHeaders,
    reloadArtistVideos
  ]);

  const handleVideoSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      await submitVideo();
    },
    [submitVideo]
  );

  useEffect(() => {
    if (!isAuthenticated) {
      setHiddenVideoIds([]);
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

  const submitClip = useCallback(async () => {
    if (creationDisabled) {
      console.warn('Authentication is required to create clips.');
      return;
    }
    const trimmedVideoUrl = clipForm.videoUrl.trim();
    const tags = parseTags(clipForm.tags);

    if (!trimmedVideoUrl && !selectedVideo) {
      console.warn('클립을 저장하려면 라이브 영상 URL을 입력하거나 기존 영상을 선택해 주세요.');
      return;
    }

    const payload: ClipCreationPayload = {
      title: clipForm.title,
      startSec: Number(clipForm.startSec),
      endSec: Number(clipForm.endSec),
      tags
    };

    if (trimmedVideoUrl) {
      const parsedArtistId = Number(videoForm.artistId);
      if (!videoForm.artistId || Number.isNaN(parsedArtistId)) {
        console.warn('라이브 영상 URL을 등록하려면 아티스트를 먼저 선택해야 합니다.');
        return;
      }
      payload.videoUrl = trimmedVideoUrl;
      payload.artistId = parsedArtistId;
    } else if (selectedVideo) {
      payload.videoId = selectedVideo;
    }

    try {
      await createClip(payload);
    } catch (error) {
      console.error('Failed to create clip', error);
    }
  }, [
    creationDisabled,
    clipForm.videoUrl,
    clipForm.tags,
    clipForm.title,
    clipForm.startSec,
    clipForm.endSec,
    selectedVideo,
    videoForm.artistId,
    createClip
  ]);

  const handleClipSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      await submitClip();
    },
    [submitClip]
  );

  const handleMediaSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (isClipRegistration) {
        await submitClip();
        return;
      }
      await submitVideo();
    },
    [isClipRegistration, submitClip, submitVideo]
  );

  const handleMediaUrlChange = useCallback(
    (value: string) => {
      setVideoForm((prev) => ({ ...prev, url: value }));
      setClipForm((prev) => ({ ...prev, videoUrl: value }));
      if (value.trim().length > 0) {
        setSelectedVideo(null);
      }
    },
    [setClipForm, setSelectedVideo, setVideoForm]
  );

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
    const controller = new AbortController();
    reloadArtistVideos({ signal: controller.signal }).catch((error) => {
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      console.error('Failed to refresh videos', error);
    });
    return () => {
      controller.abort();
    };
  }, [reloadArtistVideos]);

  const handleArtistClick = (artistId: number) => {
    setVideoForm((prev) => ({ ...prev, artistId: String(artistId) }));
    setSelectedVideo(null);
    setActiveClipId(null);
    setClipCandidates([]);
    setClips([]);
  };

  const handleArtistClear = () => {
    setVideoForm((prev) => ({ ...prev, artistId: '' }));
    setSelectedVideo(null);
    setVideos([]);
    setClipCandidates([]);
    setClips([]);
    setLibraryVideoFormOpen(false);
    setLibraryClipFormOpen(false);
  };

  const handleLibraryVideoSelect = (videoId: number) => {
    setSelectedVideo(videoId);
  };

  const handleVideoFavoriteToggle = useCallback((videoId: number) => {
    setFavoriteVideoIds((prev) =>
      prev.includes(videoId) ? prev.filter((id) => id !== videoId) : [...prev, videoId]
    );
  }, []);

  const handleVideoPlaylistToggle = useCallback((videoId: number) => {
    setPlaylistVideoIds((prev) =>
      prev.includes(videoId) ? prev.filter((id) => id !== videoId) : [...prev, videoId]
    );
  }, []);

  const handleVideoCardKeyDown = (event: KeyboardEvent<HTMLDivElement>, videoId: number) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleLibraryVideoSelect(videoId);
    }
  };

  const ArtistLibraryCard = ({
    artist,
    isActive = false,
    interactive = true,
    focusMode = false,
    onSelect
  }: {
    artist: ArtistResponse;
    isActive?: boolean;
    interactive?: boolean;
    focusMode?: boolean;
    onSelect?: () => void;
  }) => {
    const fallbackAvatarUrl = `https://ui-avatars.com/api/?background=111827&color=e2e8f0&name=${encodeURIComponent(
      artist.displayName || artist.name
    )}`;
    const countryBadges = resolveArtistCountryBadges(artist);
    const classNames = ['artist-library__card'];
    if (isActive) {
      classNames.push('selected');
    }
    if (focusMode) {
      classNames.push('artist-library__card--focused');
    }

    return (
      <div
        className={classNames.join(' ')}
        role={interactive ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        aria-pressed={interactive ? isActive : undefined}
        onClick={
          interactive
            ? () => {
                onSelect?.();
              }
            : undefined
        }
        onKeyDown={
          interactive
            ? (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect?.();
                }
              }
            : undefined
        }
      >
        <div className="artist-library__avatar">
          {artist.profileImageUrl ? (
            <img
              src={artist.profileImageUrl}
              alt={`${artist.displayName || artist.name} 채널 프로필 이미지`}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={(event) => {
                if (event.currentTarget.src !== fallbackAvatarUrl) {
                  event.currentTarget.src = fallbackAvatarUrl;
                }
              }}
            />
          ) : (
            <img
              src={fallbackAvatarUrl}
              alt={`${artist.displayName || artist.name} 기본 프로필 이미지`}
              loading="lazy"
              decoding="async"
            />
          )}
        </div>
        <div className="artist-library__info">
          <span className="artist-library__name">{artist.displayName || artist.name}</span>
          <span className="artist-library__channel">
            {artist.youtubeChannelTitle || artist.youtubeChannelId}
          </span>
        </div>
        {countryBadges.length > 0 && (
          <div className="artist-library__countries">
            {countryBadges.map((badge) => (
              <span key={badge.code} className="artist-country-badge">
                <span className="artist-country-badge__code">{badge.code}</span>
                {badge.label}
              </span>
            ))}
          </div>
        )}
        {artist.youtubeChannelId && (
          <a
            className="artist-library__link"
            href={artist.youtubeChannelId.startsWith('@')
              ? `https://www.youtube.com/${artist.youtubeChannelId}`
              : `https://www.youtube.com/channel/${artist.youtubeChannelId}`}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => {
              if (interactive) {
                event.stopPropagation();
              }
            }}
          >
            유튜브 채널 보기
          </a>
        )}
      </div>
    );
  };

  const openArtistRegistration = useCallback(() => {
    setActiveSection('management');
    setActiveManagementTab('artists');
  }, [setActiveManagementTab, setActiveSection]);

  useEffect(() => {
    setSelectedVideo((previous) => {
      if (
        previous &&
        (videos.some((video) => video.id === previous) || hiddenVideoIds.includes(previous))
      ) {
        return previous;
      }
      const clipSource = videos.find((video) => isClipSourceVideo(video));
      if (clipSource) {
        return clipSource.id;
      }
      return videos.length > 0 ? videos[0].id : null;
    });
  }, [videos, hiddenVideoIds]);

  const selectedArtist = artists.find((artist) => artist.id === Number(videoForm.artistId));
  const noArtistsRegistered = artists.length === 0;
  const noFilteredArtists = !noArtistsRegistered && filteredArtists.length === 0 && !selectedArtist;
  const artistList: ArtistResponse[] = filteredArtists as ArtistResponse[];
  const selectedArtistId = selectedArtist?.id ?? null;

  useEffect(() => {
    setLibraryVideoFormOpen(false);
    setLibraryClipFormOpen(false);
  }, [selectedArtistId]);

  const handleLibraryVideoRegister = useCallback(() => {
    if (!selectedArtistId) {
      return;
    }
    setVideoForm((prev) => ({ ...prev, artistId: String(selectedArtistId) }));
    setLibraryClipFormOpen(false);
    setLibraryVideoFormOpen((prev) => !prev);
  }, [selectedArtistId]);

  const handleLibraryClipRegister = useCallback(() => {
    if (!selectedArtistId) {
      return;
    }
    setVideoForm((prev) => ({ ...prev, artistId: String(selectedArtistId) }));
    setLibraryVideoFormOpen(false);
    setLibraryClipFormOpen((prev) => !prev);
  }, [selectedArtistId]);
  const handleClipCardToggle = useCallback((clip: ClipResponse) => {
    if (!clip.youtubeVideoId) {
      return;
    }
    setActiveClipId((previous) => (previous === clip.id ? null : clip.id));
  }, []);
  const selectedVideoData = selectedVideo ? videos.find((video) => video.id === selectedVideo) : null;
  const selectedVideoIsHidden = selectedVideo !== null && hiddenVideoIds.includes(selectedVideo);
  const displayableVideos = useMemo(
    () => videos.filter((video) => !hiddenVideoIds.includes(video.id)),
    [videos, hiddenVideoIds]
  );
  const clipSourceVideos = useMemo(
    () => displayableVideos.filter((video) => isClipSourceVideo(video)),
    [displayableVideos]
  );
  const officialVideos = useMemo(
    () => displayableVideos.filter((video) => !isClipSourceVideo(video)),
    [displayableVideos]
  );
  const displayedClips = isAuthenticated ? clips : publicClips;
  const selectedVideoClips = useMemo(
    () => (selectedVideo ? displayedClips.filter((clip) => clip.videoId === selectedVideo) : []),
    [displayedClips, selectedVideo]
  );
  useEffect(() => {
    setActiveClipId((previous) =>
      previous && selectedVideoClips.some((clip) => clip.id === previous) ? previous : null
    );
  }, [selectedVideoClips]);
  const playlistHeading = isAuthenticated ? '유저가 저장한 플레이리스트' : '공개된 클립 모음';
  const playlistSubtitle = isAuthenticated
    ? '(백그라운드 재생)'
    : '로그인 없이 감상 가능한 클립 모음';
  const playlistEmptyMessage = isAuthenticated
    ? '선택된 영상의 저장된 클립이 없습니다.'
    : '공개된 클립이 아직 없습니다.';
  const previewStartSec = Math.max(0, Number(clipForm.startSec) || 0);
  const fallbackEnd = selectedVideoData?.durationSec
    ? Math.min(selectedVideoData.durationSec, previewStartSec + 30)
    : previewStartSec + 30;
  const previewEndSec = Number(clipForm.endSec) > previewStartSec ? Number(clipForm.endSec) : fallbackEnd;

  const sidebarTabs = useMemo(() => {
    const tabs: {
      id: SectionKey;
      label: string;
      description: string;
      icon: JSX.Element;
    }[] = [
      {
        id: 'library',
        label: '아티스트 라이브러리',
        description: '최신 아티스트 목록과 영상을 탐색하세요.',
        icon: (
          <svg viewBox="0 0 24 24" role="presentation" aria-hidden="true">
            <path
              d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v11a2.5 2.5 0 0 1-2.5 2.5H6.5A2.5 2.5 0 0 1 4 16.5v-11ZM9.5 8.75l6 3.25-6 3.25v-6.5Z"
              fill="currentColor"
            />
          </svg>
        )
      },
      {
        id: 'management',
        label: '콘텐츠 관리',
        description: '클립 · 영상 · 아티스트 등록',
        icon: (
          <svg viewBox="0 0 24 24" role="presentation" aria-hidden="true">
            <path
              d="M6.75 3A1.75 1.75 0 0 0 5 4.75v14.5C5 20.216 5.784 21 6.75 21h10.5A1.75 1.75 0 0 0 19 19.25V4.75A1.75 1.75 0 0 0 17.25 3H6.75ZM8 6h8v2H8V6Zm0 5h8v2H8v-2Zm0 5h5v2H8v-2Z"
              fill="currentColor"
            />
          </svg>
        )
      },
      {
        id: 'playlist',
        label: '플레이리스트',
        description: '저장된 클립과 태그 모아보기',
        icon: (
          <svg viewBox="0 0 24 24" role="presentation" aria-hidden="true">
            <path
              d="M4 5a1 1 0 0 1 1-1h10.5a1 1 0 0 1 0 2H5a1 1 0 0 1-1-1Zm0 5a1 1 0 0 1 1-1h10.5a1 1 0 0 1 0 2H5a1 1 0 0 1-1-1Zm14a2.75 2.75 0 1 1 2.75 2.75A2.75 2.75 0 0 1 18 12.75Zm0 4.5a4.5 4.5 0 1 0-3.583-1.75l-.752 1.503a1 1 0 1 0 1.788.894l.719-1.437a4.47 4.47 0 0 0 1.828.39Z"
              fill="currentColor"
            />
          </svg>
        )
      }
    ];

    if (isAuthenticated) {
      tabs.push({
        id: 'mypage',
        label: '마이페이지',
        description: '프로필 및 보안 설정 관리',
        icon: (
          <svg viewBox="0 0 24 24" role="presentation" aria-hidden="true">
            <path
              d="M12 2a5 5 0 0 1 5 5v1a5 5 0 1 1-10 0V7a5 5 0 0 1 5-5Zm0 12c3.87 0 7 2.239 7 5v1a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-1c0-2.761 3.13-5 7-5Z"
              fill="currentColor"
            />
          </svg>
        )
      });
    }

    return tabs;
  }, [isAuthenticated]);

  const activeSidebarTab = sidebarTabs.find((tab) => tab.id === activeSection) ?? sidebarTabs[0];

  const previousAuthRef = useRef(isAuthenticated);

  useEffect(() => {
    if (!previousAuthRef.current && isAuthenticated) {
      setActiveSection('library');
      closeSignupPopup();
    } else if (previousAuthRef.current && !isAuthenticated && activeSection === 'mypage') {
      setActiveSection('library');
    }
    previousAuthRef.current = isAuthenticated;
  }, [isAuthenticated, activeSection, closeSignupPopup]);


  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="주요 탐색">
        <div className="sidebar__brand">
          <div className="sidebar__logo" aria-hidden="true">
            <span>YT</span>
          </div>
          <div className="sidebar__brand-copy">
            <p className="sidebar__eyebrow">Youtube Clip Curator</p>
            <h1>Creator Studio</h1>
          </div>
        </div>
        <div className="sidebar__auth-card">
          <div className="sidebar__auth-header">
            <h2>{isAuthenticated ? '내 계정' : '로그인'}</h2>
            <p>{isAuthenticated ? '마이페이지에서 프로필과 보안 설정을 관리하세요.' : '아티스트 관리를 위해 로그인하세요.'}</p>
          </div>
          {isAuthenticated ? (
            <div className="sidebar__auth-content">
              <p className="login-status__message">
                {currentUser?.displayName
                  ? `${currentUser.displayName} 님, 환영합니다!`
                  : `${currentUser?.email ?? ''} 계정으로 로그인되었습니다.`}
              </p>
              {currentUser?.email && (
                <p className="sidebar__auth-email">{currentUser.email}</p>
              )}
              {isLoadingUser && <p className="sidebar__auth-muted">사용자 정보를 불러오는 중...</p>}
              {passwordLoginMessage && (
                <p className="login-status__message">{passwordLoginMessage}</p>
              )}
              <div className="sidebar__auth-actions">
                <button type="button" onClick={() => setActiveSection('mypage')} className="sidebar__auth-button primary">
                  마이페이지로 이동
                </button>
                <button type="button" onClick={handleSignOut} className="sidebar__auth-button">
                  로그아웃
                </button>
              </div>
            </div>
          ) : (
            <div className="sidebar__auth-content">
              <div className="sidebar__auth-social">
                {isGoogleReady ? (
                  <GoogleLoginButton
                    clientId="245943329145-os94mkp21415hadulir67v1i0lqjrcnq.apps.googleusercontent.com"
                    onCredential={handleGoogleCredential}
                  />
                ) : (
                  <span className="sidebar__auth-muted">구글 로그인 준비 중...</span>
                )}
              </div>
              <form className="stacked-form" onSubmit={handlePasswordLogin}>
                <label htmlFor="loginEmailInput">이메일 로그인</label>
                <input
                  id="loginEmailInput"
                  type="email"
                  placeholder="이메일 주소"
                  value={passwordLoginEmail}
                  onChange={(event) => setPasswordLoginEmail(event.target.value)}
                />
                <label htmlFor="loginPassword">비밀번호</label>
                <input
                  id="loginPassword"
                  type="password"
                  placeholder="비밀번호"
                  value={passwordLoginPassword}
                  onChange={(event) => setPasswordLoginPassword(event.target.value)}
                />
                <button type="submit">로그인</button>
              </form>
              <div className="sidebar__auth-footer">
                <button type="button" className="sidebar__auth-button" onClick={openSignupPopup}>
                  이메일 회원가입
                </button>
              </div>
              {passwordLoginMessage && (
                <p className="login-status__message">{passwordLoginMessage}</p>
              )}
              {passwordLoginError && (
                <p className="login-status__message error">{passwordLoginError}</p>
              )}
            </div>
          )}
        </div>
        <nav className="sidebar__nav">
          {sidebarTabs.map((tab) => {
            const isActive = activeSection === tab.id;
            return (
              <button
                key={tab.id}
                id={`sidebar-tab-${tab.id}`}
                type="button"
                className={`sidebar__tab${isActive ? ' active' : ''}`}
                onClick={() => setActiveSection(tab.id)}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className="sidebar__tab-icon">{tab.icon}</span>
                <span className="sidebar__tab-text">
                  <span className="sidebar__tab-label">{tab.label}</span>
                  <span className="sidebar__tab-description">{tab.description}</span>
                </span>
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="content-area">
        <header className="content-header">
          <div>
            <p className="content-header__eyebrow">Youtube Clip Curator</p>
            <h2>{activeSidebarTab.label}</h2>
            <p className="content-header__description">{activeSidebarTab.description}</p>
          </div>
        </header>

        <div className="content-panels">


          <section
            className={`content-panel${activeSection === 'management' ? ' active' : ''}`}
            role="tabpanel"
            aria-labelledby="sidebar-tab-management"
            hidden={activeSection !== 'management'}
          >
            <div className="panel management-panel">
              <div className="section-heading">
                <h2>데이터 관리</h2>
                <p>아티스트, 영상, 클립을 관리하고 자동 클립 탐지를 실행할 수 있습니다.</p>
              </div>
              <div className="management-tabs">
                <button
                  type="button"
                  className={activeManagementTab === 'media' ? 'active' : ''}
                  onClick={() => setActiveManagementTab('media')}
                >
                  영상·클립 등록
                </button>
                <button
                  type="button"
                  className={activeManagementTab === 'artists' ? 'active' : ''}
                  onClick={() => setActiveManagementTab('artists')}
                >
                  아티스트 등록
                </button>
              </div>
              <div className="management-content">
                {activeManagementTab === 'media' && (
                  <>
                    <div className="management-section">
                      <h3>영상·클립 등록</h3>
                      <form onSubmit={handleMediaSubmit} className="stacked-form">
                        <label htmlFor="mediaUrl">YouTube URL</label>
                        <div className="number-row">
                          <input
                            id="mediaUrl"
                            placeholder="https://www.youtube.com/watch?v=..."
                            value={videoForm.url}
                            onChange={(event) => handleMediaUrlChange(event.target.value)}
                            required={!isClipRegistration}
                            disabled={creationDisabled}
                          />
                          {!isClipRegistration && (
                            <button
                              type="button"
                              onClick={handleVideoSectionPreviewFetch}
                              disabled={creationDisabled || isFetchingVideoSections}
                            >
                              {isFetchingVideoSections ? '구간 불러오는 중...' : '구간 불러오기'}
                            </button>
                          )}
                        </div>
                        <p className="form-hint">watch가 포함된 URL은 자동으로 클립 등록으로 분류됩니다.</p>
                        {!isClipRegistration && (
                          <>
                            {videoSectionPreviewError && (
                              <p className="login-status__message error">{videoSectionPreviewError}</p>
                            )}
                            {videoSectionPreview.length > 0 && (
                              <div className="section-preview">
                                <p className="artist-preview__hint">
                                  자동으로 {videoSectionPreview.length}개의 구간을 찾았습니다. 영상 저장 후 아래에서 클립을 등록하세요.
                                </p>
                                <ul className="video-item__sections">
                                  {videoSectionPreview.map((section, index) => (
                                    <li
                                      key={`${section.startSec}-${section.endSec}-${index}`}
                                      className="video-item__section"
                                      onClick={() => handlePreviewSectionApply(section, index)}
                                      role="button"
                                      tabIndex={0}
                                      onKeyDown={(event) => {
                                        if (
                                          event.key === 'Enter' ||
                                          event.key === ' ' ||
                                          event.key === 'Space' ||
                                          event.key === 'Spacebar'
                                        ) {
                                          event.preventDefault();
                                          handlePreviewSectionApply(section, index);
                                        }
                                      }}
                                    >
                                      <span className="video-item__section-time">
                                        {formatSeconds(section.startSec)} → {formatSeconds(section.endSec)}
                                      </span>
                                      <span className="video-item__section-title">
                                        {section.title || `구간 ${index + 1}`}
                                      </span>
                                      <span className="video-item__section-source">
                                        {describeSectionSource(section.source)}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {hasAttemptedVideoSectionPreview &&
                              !isFetchingVideoSections &&
                              !videoSectionPreviewError &&
                              videoSectionPreview.length === 0 && (
                                <p className="artist-preview__hint">
                                  자동 구간을 찾지 못했습니다. 영상 저장 후 아래에서 직접 구간을 지정하세요.
                                </p>
                              )}
                          </>
                        )}
                        <label htmlFor="mediaArtistId">아티스트 선택</label>
                        <select
                          id="mediaArtistId"
                          value={videoForm.artistId}
                          onChange={(event) => setVideoForm((prev) => ({ ...prev, artistId: event.target.value }))}
                          required
                          disabled={creationDisabled || artists.length === 0}
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
                        {isClipRegistration && (
                          <>
                            <label htmlFor="clipVideoId">영상 선택</label>
                            <p className="form-hint">등록된 라이브 영상을 선택하거나 URL을 입력해 새로운 클립 원본을 등록하세요.</p>
                            <select
                              id="clipVideoId"
                              value={selectedVideo ?? ''}
                              onChange={(event) => {
                                const { value } = event.target;
                                if (value === '') {
                                  setSelectedVideo(null);
                                  return;
                                }
                                const parsed = Number(value);
                                setSelectedVideo(Number.isNaN(parsed) ? null : parsed);
                              }}
                              disabled={creationDisabled || displayableVideos.length === 0}
                            >
                              <option value="">선택 안 함</option>
                              {clipSourceVideos.length > 0 && (
                                <optgroup label="라이브/클립 원본">
                                  {clipSourceVideos.map((video) => (
                                    <option key={video.id} value={video.id}>
                                      {(video.title || video.youtubeVideoId) ?? video.youtubeVideoId} ·{' '}
                                      {describeVideoContentType(video.contentType)}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                              {officialVideos.length > 0 && (
                                <optgroup label="공식 영상">
                                  {officialVideos.map((video) => (
                                    <option key={video.id} value={video.id}>
                                      {(video.title || video.youtubeVideoId) ?? video.youtubeVideoId} ·{' '}
                                      {describeVideoContentType(video.contentType)}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                            </select>
                            {selectedVideoData?.sections && selectedVideoData.sections.length > 0 ? (
                              <div className="section-preview">
                                <p className="artist-preview__hint">구간을 클릭하면 시간이 자동으로 입력됩니다.</p>
                                <ul className="video-item__sections">
                                  {selectedVideoData.sections.map((section, index) => (
                                    <li
                                      key={`${section.startSec}-${section.endSec}-${index}`}
                                      className="video-item__section"
                                      onClick={() => applyVideoSectionToClip(section, `구간 ${index + 1}`)}
                                      role="button"
                                      tabIndex={0}
                                      onKeyDown={(event) => {
                                        if (
                                          event.key === 'Enter' ||
                                          event.key === ' ' ||
                                          event.key === 'Space' ||
                                          event.key === 'Spacebar'
                                        ) {
                                          event.preventDefault();
                                          applyVideoSectionToClip(section, `구간 ${index + 1}`);
                                        }
                                      }}
                                    >
                                      <span className="video-item__section-time">
                                        {formatSeconds(section.startSec)} → {formatSeconds(section.endSec)}
                                      </span>
                                      <span className="video-item__section-title">
                                        {section.title || `구간 ${index + 1}`}
                                      </span>
                                      <span className="video-item__section-source">
                                        {describeSectionSource(section.source)}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : (
                              selectedVideo && (
                                <p className="artist-preview__hint">
                                  저장된 구간이 없습니다. 아래에서 직접 시간을 입력하세요.
                                </p>
                              )
                            )}
                            <label htmlFor="clipTitle">클립 제목</label>
                            <input
                              id="clipTitle"
                              placeholder="클립 제목"
                              value={clipForm.title}
                              onChange={(event) => setClipForm((prev) => ({ ...prev, title: event.target.value }))}
                              required
                              disabled={creationDisabled}
                            />
                            <div className="number-row">
                              <div>
                                <label htmlFor="clipStartSec">시작 시간 (초)</label>
                                <input
                                  id="clipStartSec"
                                  type="number"
                                  min="0"
                                  value={clipForm.startSec}
                                  onChange={(event) =>
                                    setClipForm((prev) => ({ ...prev, startSec: Number(event.target.value) }))
                                  }
                                  required
                                  disabled={creationDisabled}
                                />
                              </div>
                              <div>
                                <label htmlFor="clipEndSec">종료 시간 (초)</label>
                                <input
                                  id="clipEndSec"
                                  type="number"
                                  min="0"
                                  value={clipForm.endSec}
                                  onChange={(event) =>
                                    setClipForm((prev) => ({ ...prev, endSec: Number(event.target.value) }))
                                  }
                                  required
                                  disabled={creationDisabled}
                                />
                              </div>
                            </div>
                            <label htmlFor="clipTags">태그 (쉼표로 구분)</label>
                            <input
                              id="clipTags"
                              placeholder="예: 하이라이트, 라이브"
                              value={clipForm.tags}
                              onChange={(event) => setClipForm((prev) => ({ ...prev, tags: event.target.value }))}
                              disabled={creationDisabled}
                            />
                          </>
                        )}
                        <button type="submit" disabled={creationDisabled}>
                          {isClipRegistration ? '클립 등록' : '영상 메타데이터 저장'}
                        </button>
                      </form>
                      {isClipRegistration && (
                        <>
                          <div className="clip-preview">
                            <h4>프리뷰</h4>
                            {selectedVideoData ? (
                              <>
                                <p className="form-hint">
                                  {describeVideoContentType(selectedVideoData.contentType)} 영상 ·{' '}
                                  {selectedVideoData.title || selectedVideoData.youtubeVideoId}
                                </p>
                                <ClipPlayer
                                  youtubeVideoId={selectedVideoData.youtubeVideoId}
                                  startSec={previewStartSec}
                                  endSec={previewEndSec}
                                  autoplay={false}
                                />
                              </>
                            ) : (
                              <p className="empty-state">클립 프리뷰를 확인하려면 영상을 선택하세요.</p>
                            )}
                          </div>
                          <div className="auto-detect">
                            <div className="number-row">
                              <select
                                id="detectVideo"
                                value={selectedVideo ?? ''}
                                onChange={(event) => {
                                  const { value } = event.target;
                                  if (value === '') {
                                    setSelectedVideo(null);
                                    return;
                                  }
                                  const parsed = Number(value);
                                  setSelectedVideo(Number.isNaN(parsed) ? null : parsed);
                                }}
                                disabled={creationDisabled || displayableVideos.length === 0}
                              >
                                <option value="">선택 안 함</option>
                                {clipSourceVideos.length > 0 && (
                                  <optgroup label="라이브/클립 원본">
                                    {clipSourceVideos.map((video) => (
                                      <option key={video.id} value={video.id}>
                                        {(video.title || video.youtubeVideoId) ?? video.youtubeVideoId} ·{' '}
                                        {describeVideoContentType(video.contentType)}
                                      </option>
                                    ))}
                                  </optgroup>
                                )}
                                {officialVideos.length > 0 && (
                                  <optgroup label="공식 영상">
                                    {officialVideos.map((video) => (
                                      <option key={video.id} value={video.id}>
                                        {(video.title || video.youtubeVideoId) ?? video.youtubeVideoId} ·{' '}
                                        {describeVideoContentType(video.contentType)}
                                      </option>
                                    ))}
                                  </optgroup>
                                )}
                              </select>
                              <select
                                id="detectMode"
                                value={autoDetectMode}
                                onChange={(event) => setAutoDetectMode(event.target.value)}
                                disabled={creationDisabled}
                              >
                                <option value="chapters">챕터 기반</option>
                                <option value="captions">자막 기반</option>
                                <option value="combined">혼합</option>
                              </select>
                            </div>
                            <button type="button" onClick={runAutoDetect} disabled={creationDisabled || !selectedVideo}>
                              자동으로 클립 제안 받기
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </>
                )}
                {activeManagementTab === 'artists' && (
                  <div className="management-section">
                    <h3>아티스트 등록</h3>
                    <div className="artist-registration">
                      <form onSubmit={handleArtistSubmit} className="stacked-form artist-registration__form">
                        <label htmlFor="artistName">아티스트 이름</label>
                        <input
                          id="artistName"
                          placeholder="아티스트 이름"
                          value={artistForm.name}
                          onChange={(event) => setArtistForm((prev) => ({ ...prev, name: event.target.value }))}
                          required
                          disabled={creationDisabled}
                        />
                        <label htmlFor="artistChannelId">YouTube 채널 ID</label>
                        <input
                          id="artistChannelId"
                          placeholder="UC..."
                          value={artistForm.channelId}
                          onChange={(event) => setArtistForm((prev) => ({ ...prev, channelId: event.target.value }))}
                          required
                          disabled={creationDisabled}
                        />
                        <fieldset className="artist-registration__countries">
                          <legend>서비스 국가</legend>
                          <p className="artist-registration__countries-hint">복수 선택 가능</p>
                          <div className="artist-registration__country-options">
                            <label className="artist-registration__country-option">
                              <input
                                type="checkbox"
                                checked={artistForm.countries.ko}
                                onChange={(event) =>
                                  setArtistForm((prev) => ({
                                    ...prev,
                                    countries: { ...prev.countries, ko: event.target.checked }
                                  }))
                                }
                                disabled={creationDisabled}
                              />
                              <span className="artist-registration__country-label">
                                <span className="artist-registration__country-code">KO</span>
                                한국
                              </span>
                            </label>
                            <label className="artist-registration__country-option">
                              <input
                                type="checkbox"
                                checked={artistForm.countries.en}
                                onChange={(event) =>
                                  setArtistForm((prev) => ({
                                    ...prev,
                                    countries: { ...prev.countries, en: event.target.checked }
                                  }))
                                }
                                disabled={creationDisabled}
                              />
                              <span className="artist-registration__country-label">
                                <span className="artist-registration__country-code">EN</span>
                                영어권
                              </span>
                            </label>
                            <label className="artist-registration__country-option">
                              <input
                                type="checkbox"
                                checked={artistForm.countries.jp}
                                onChange={(event) =>
                                  setArtistForm((prev) => ({
                                    ...prev,
                                    countries: { ...prev.countries, jp: event.target.checked }
                                  }))
                                }
                                disabled={creationDisabled}
                              />
                              <span className="artist-registration__country-label">
                                <span className="artist-registration__country-code">JP</span>
                                일본
                              </span>
                            </label>
                          </div>
                        </fieldset>
                        <button type="submit" disabled={creationDisabled || isArtistPreviewLoading}>
                          {isArtistPreviewLoading ? '채널 확인 중...' : artistSubmitLabel}
                        </button>
                        {artistPreviewReady && artistPreview && (
                          <p className="artist-preview__hint">채널 정보를 확인하셨다면 다시 등록 버튼을 눌러 완료하세요.</p>
                        )}
                        {artistPreviewError && (
                          <p className="artist-preview__error" role="alert">
                            {artistPreviewError}
                          </p>
                        )}
                      </form>
                      <aside className="artist-preview-panel" aria-live="polite">
                        <div className="artist-preview-panel__header">
                          <h4>채널 미리보기</h4>
                          <button
                            type="button"
                            className="artist-debug-toggle"
                            onClick={() => setArtistDebugVisible((prev) => !prev)}
                          >
                            {isArtistDebugVisible ? '디버그 숨기기' : '디버그 보기'}
                          </button>
                        </div>
                        <div className="artist-preview-panel__body">
                          {isArtistPreviewLoading ? (
                            <p className="artist-preview__status">채널 정보를 불러오는 중...</p>
                          ) : artistPreview ? (
                            <div className="artist-preview__content">
                              {artistPreview.data.profileImageUrl ? (
                                <img
                                  className="artist-preview__thumbnail"
                                  src={artistPreview.data.profileImageUrl}
                                  alt={
                                    artistPreview.data.title
                                      ? `${artistPreview.data.title} 채널 썸네일`
                                      : '채널 썸네일'
                                  }
                                />
                              ) : (
                                <div className="artist-preview__thumbnail artist-preview__thumbnail--placeholder">
                                  썸네일 없음
                                </div>
                              )}
                              <div className="artist-preview__details">
                                <div className="artist-preview__meta">
                                  <p className="artist-preview__title">
                                    {artistPreview.data.title ?? '채널 제목을 확인할 수 없습니다.'}
                                  </p>
                                  {artistPreview.data.channelUrl && (
                                    <a
                                      className="artist-preview__link"
                                      href={artistPreview.data.channelUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      채널 바로가기
                                    </a>
                                  )}
                                  {artistPreview.data.channelId && (
                                    <p className="artist-preview__channel-id">{artistPreview.data.channelId}</p>
                                  )}
                                  {artistPreviewSource && (
                                    <p className="artist-preview__source">데이터 출처: {artistPreviewSource}</p>
                                  )}
                                  {artistPreview.data.debug?.apiStatus !== undefined &&
                                    artistPreview.data.debug?.apiStatus !== null && (
                                      <p className="artist-preview__api-status">
                                        API 응답 상태: {artistPreview.data.debug.apiStatus}
                                      </p>
                                    )}
                                </div>
                                <div className="artist-preview__videos">
                                  <div className="artist-preview__videos-header">
                                    <h5>키워드 매칭 영상</h5>
                                    {previewVideoKeywords.length > 0 && (
                                      <span className="artist-preview__videos-keywords">
                                        키워드: {previewVideoKeywords.join(' / ')}
                                      </span>
                                    )}
                                  </div>
                                  {previewVideos.length > 0 ? (
                                    <ul className="artist-preview__videos-list">
                                      {previewVideos.map((video) => {
                                        const publishedLabel = formatPreviewVideoDate(video.publishedAt);
                                        return (
                                          <li key={video.videoId} className="artist-preview__video">
                                            {video.thumbnailUrl ? (
                                              <img
                                                className="artist-preview__video-thumbnail"
                                                src={video.thumbnailUrl}
                                                alt={video.title ? `${video.title} 썸네일` : '영상 썸네일'}
                                                loading="lazy"
                                                decoding="async"
                                              />
                                            ) : (
                                              <div className="artist-preview__video-thumbnail artist-preview__video-thumbnail--placeholder">
                                                썸네일 없음
                                              </div>
                                            )}
                                            <div className="artist-preview__video-meta">
                                              <p className="artist-preview__video-title">
                                                {video.title ?? `영상 ${video.videoId}`}
                                              </p>
                                              {publishedLabel && (
                                                <p className="artist-preview__video-date">업로드: {publishedLabel}</p>
                                              )}
                                              <div className="artist-preview__video-actions">
                                                <a
                                                  className="artist-preview__video-link"
                                                  href={video.url}
                                                  target="_blank"
                                                  rel="noreferrer"
                                                >
                                                  유튜브에서 보기
                                                </a>
                                                <button
                                                  type="button"
                                                  className="artist-preview__video-apply"
                                                  onClick={() => applyPreviewVideoToForm(video)}
                                                >
                                                  영상 등록 폼에 추가
                                                </button>
                                              </div>
                                            </div>
                                          </li>
                                        );
                                      })}
                                    </ul>
                                  ) : (
                                    <p className="artist-preview__videos-empty">
                                      {artistPreview.data.debug?.videoFetchError
                                        ? `채널 영상 정보를 불러올 수 없습니다. (${artistPreview.data.debug.videoFetchError})`
                                        : '조건에 맞는 영상을 찾지 못했습니다.'}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <p className="artist-preview__empty">
                              채널 ID를 입력한 뒤 등록 버튼을 눌러 미리보기를 확인하세요.
                            </p>
                          )}
                        </div>
                        {isArtistDebugVisible && (
                          <div className="artist-debug-log">
                            {artistDebugLog.length === 0 ? (
                              <p className="artist-debug-log__empty">최근 디버그 로그가 없습니다.</p>
                            ) : (
                              <ul className="artist-debug-log__list">
                                {artistDebugLog.map((entry) => (
                                  <li key={entry.id} className="artist-debug-log__entry">
                                    <div className="artist-debug-log__entry-header">
                                      <span className="artist-debug-log__label">{formatDebugLabel(entry.type)}</span>
                                      <span className="artist-debug-log__timestamp">
                                        {formatTimestamp(entry.timestamp)}
                                      </span>
                                    </div>
                                    <details className="artist-debug-log__details">
                                      <summary>세부 정보</summary>
                                      <pre>{JSON.stringify({ request: entry.request, response: entry.response, error: entry.error }, null, 2)}</pre>
                                    </details>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </aside>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section
            className={`content-panel${activeSection === 'mypage' ? ' active' : ''}`}
            role="tabpanel"
            aria-labelledby="sidebar-tab-mypage"
            hidden={activeSection !== 'mypage'}
          >
            <div className="panel settings-panel">
              {isAuthenticated ? (
                <>
                  <div className="settings-section">
                    <h2>프로필 설정</h2>
                    <p>닉네임은 저장된 클립과 플레이리스트에서 표시됩니다.</p>
                    <form className="stacked-form" onSubmit={handleNicknameSubmit}>
                      <label htmlFor="nicknameInput">닉네임</label>
                      <input
                        id="nicknameInput"
                        placeholder="닉네임"
                        value={nicknameInput}
                        onChange={(event) => setNicknameInput(event.target.value)}
                      />
                      <button type="submit">닉네임 저장</button>
                    </form>
                    {nicknameStatus && <p className="login-status__message">{nicknameStatus}</p>}
                    {nicknameError && <p className="login-status__message error">{nicknameError}</p>}
                  </div>

                  <div className="settings-section">
                    <h3>비밀번호 변경</h3>
                    <p className="sidebar__auth-muted">로그인 세션은 로그인 시점 기준 30분간 유지됩니다.</p>
                    <form className="stacked-form" onSubmit={handlePasswordChangeSubmit}>
                      <label htmlFor="currentPassword">현재 비밀번호</label>
                      <input
                        id="currentPassword"
                        type="password"
                        placeholder="현재 비밀번호"
                        value={passwordChangeCurrent}
                        onChange={(event) => setPasswordChangeCurrent(event.target.value)}
                      />
                      <label htmlFor="newPassword">새 비밀번호</label>
                      <input
                        id="newPassword"
                        type="password"
                        placeholder="새 비밀번호 (8자 이상)"
                        value={passwordChangeNew}
                        onChange={(event) => setPasswordChangeNew(event.target.value)}
                      />
                      <label htmlFor="newPasswordConfirm">비밀번호 확인</label>
                      <input
                        id="newPasswordConfirm"
                        type="password"
                        placeholder="새 비밀번호 다시 입력"
                        value={passwordChangeConfirm}
                        onChange={(event) => setPasswordChangeConfirm(event.target.value)}
                      />
                      <button type="submit">비밀번호 변경</button>
                    </form>
                    {passwordChangeStatus && <p className="login-status__message">{passwordChangeStatus}</p>}
                    {passwordChangeError && <p className="login-status__message error">{passwordChangeError}</p>}
                  </div>
                </>
              ) : (
                <div className="settings-empty">
                  <p className="login-status__message">마이페이지는 로그인 후 이용할 수 있습니다.</p>
                  <div className="sidebar__auth-actions">
                    <button type="button" className="sidebar__auth-button primary" onClick={openSignupPopup}>
                      회원가입
                    </button>
                    <button type="button" className="sidebar__auth-button" onClick={() => setActiveSection('library')}>
                      아티스트 목록 보기
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section
            className={`content-panel${activeSection === 'library' ? ' active' : ''}`}
            role="tabpanel"
            aria-labelledby="sidebar-tab-library"
            hidden={activeSection !== 'library'}
          >
            <div className="panel media-panel">
              <div className="artist-library">
                <div className="artist-library__header">
                  <div>
                    <h3>아티스트 디렉토리</h3>
                    <p className="artist-directory__subtitle">전체 이용자가 확인할 수 있는 공개 목록입니다.</p>
                  </div>
                  <button
                    type="button"
                    className="artist-library__register"
                    onClick={openArtistRegistration}
                  >
                    아티스트 등록
                  </button>
                </div>
                {selectedArtist && (
                  <div className="artist-library__selection">
                    <span>선택된 아티스트</span>
                    <strong>{selectedArtist.displayName || selectedArtist.name}</strong>
                  </div>
                )}
                <div className="artist-library__controls">
                  <div className="artist-directory__search-group">
                    <div className="artist-directory__search">
                      <label htmlFor="artistSearch">아티스트 검색</label>
                      <div className="artist-directory__search-input-wrapper">
                        <input
                          id="artistSearch"
                          type="search"
                          value={artistSearchQuery}
                          onChange={(event) => setArtistSearchQuery(event.target.value)}
                          placeholder="이름 또는 채널 ID 검색"
                          autoComplete="off"
                        />
                        {artistSearchQuery && (
                          <button
                            type="button"
                            className="artist-directory__search-clear"
                            onClick={() => setArtistSearchQuery('')}
                            aria-label="검색어 지우기"
                          >
                            지우기
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="artist-directory__search">
                      <label htmlFor="artistTagSearch">태그 검색</label>
                      <div className="artist-directory__search-input-wrapper">
                        <input
                          id="artistTagSearch"
                          type="search"
                          value={artistTagQuery}
                          onChange={(event) => setArtistTagQuery(event.target.value)}
                          placeholder="태그 검색 (예: 라이브, 커버)"
                          autoComplete="off"
                        />
                        {artistTagQuery && (
                          <button
                            type="button"
                            className="artist-directory__search-clear"
                            onClick={() => setArtistTagQuery('')}
                            aria-label="태그 검색어 지우기"
                          >
                            지우기
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                {noArtistsRegistered ? (
                  <div className="artist-empty">등록된 아티스트가 없습니다.</div>
                ) : selectedArtist ? (
                  <div className="artist-library__split-view">
                    <div className="artist-library__focused-panel">
                      <button type="button" className="artist-library__back-button" onClick={handleArtistClear}>
                        아티스트 목록으로 돌아가기
                      </button>
                      <ArtistLibraryCard artist={selectedArtist} isActive focusMode interactive={false} />
                    </div>
                    <div className="artist-library__detail-panel">
                      <div className="artist-library__actions">
                        <button
                          type="button"
                          className="artist-library__action-button"
                          onClick={handleLibraryVideoRegister}
                          disabled={creationDisabled}
                        >
                          영상 등록
                        </button>
                        <button
                          type="button"
                          className="artist-library__action-button artist-library__action-button--secondary"
                          onClick={handleLibraryClipRegister}
                          disabled={creationDisabled}
                        >
                          클립 등록
                        </button>
                        {creationDisabled && (
                          <span className="artist-library__action-hint">로그인 후 등록할 수 있습니다.</span>
                        )}
                      </div>
                      {isLibraryMediaFormOpen && selectedArtist && (
                        <section className="artist-library__detail-section artist-library__form-section">
                          <div className="artist-library__section-header">
                            <h4>영상·클립 등록</h4>
                            <span className="artist-library__status">
                              {isClipRegistration
                                ? selectedVideoData
                                  ? selectedVideoData.title || selectedVideoData.youtubeVideoId
                                  : '등록할 영상을 선택하세요.'
                                : selectedArtist.displayName || selectedArtist.name}
                            </span>
                          </div>
                          <form onSubmit={handleMediaSubmit} className="stacked-form artist-library__form">
                            <p className="form-hint">YouTube URL에 watch가 포함되면 자동으로 클립 등록으로 전환됩니다.</p>
                            <label htmlFor="libraryMediaUrl">YouTube URL</label>
                            <div className="number-row">
                              <input
                                id="libraryMediaUrl"
                                placeholder="https://www.youtube.com/watch?v=..."
                                value={videoForm.url}
                                onChange={(event) => handleMediaUrlChange(event.target.value)}
                                required={!isClipRegistration}
                                disabled={creationDisabled}
                              />
                              {!isClipRegistration && (
                                <button
                                  type="button"
                                  onClick={handleVideoSectionPreviewFetch}
                                  disabled={creationDisabled || isFetchingVideoSections}
                                >
                                  {isFetchingVideoSections ? '구간 불러오는 중...' : '구간 불러오기'}
                                </button>
                              )}
                            </div>
                            {!isClipRegistration && (
                              <>
                                {videoSectionPreviewError && (
                                  <p className="login-status__message error">{videoSectionPreviewError}</p>
                                )}
                                {videoSectionPreview.length > 0 && (
                                  <div className="section-preview">
                                    <p className="artist-preview__hint">
                                      자동으로 {videoSectionPreview.length}개의 구간을 찾았습니다. 영상 저장 후 아래에서 클립을 등록하세요.
                                    </p>
                                    <ul className="video-item__sections">
                                      {videoSectionPreview.map((section, index) => (
                                        <li
                                          key={`${section.startSec}-${section.endSec}-${index}`}
                                          className="video-item__section"
                                          onClick={() => handlePreviewSectionApply(section, index)}
                                          role="button"
                                          tabIndex={0}
                                          onKeyDown={(event) => {
                                            if (
                                              event.key === 'Enter' ||
                                              event.key === ' ' ||
                                              event.key === 'Space' ||
                                              event.key === 'Spacebar'
                                            ) {
                                              event.preventDefault();
                                              handlePreviewSectionApply(section, index);
                                            }
                                          }}
                                        >
                                          <span className="video-item__section-time">
                                            {formatSeconds(section.startSec)} → {formatSeconds(section.endSec)}
                                          </span>
                                          <span className="video-item__section-title">
                                            {section.title || `구간 ${index + 1}`}
                                          </span>
                                          <span className="video-item__section-source">
                                            {describeSectionSource(section.source)}
                                          </span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                                {hasAttemptedVideoSectionPreview &&
                                  !isFetchingVideoSections &&
                                  !videoSectionPreviewError &&
                                  videoSectionPreview.length === 0 && (
                                    <p className="artist-preview__hint">
                                      자동 구간을 찾지 못했습니다. 영상 저장 후 아래에서 직접 구간을 지정하세요.
                                    </p>
                                  )}
                              </>
                            )}
                            {isClipRegistration && (
                              <>
                                <label htmlFor="libraryClipVideoId">영상 선택</label>
                                <p className="form-hint">등록된 라이브 영상을 선택하거나 URL을 입력해 새로운 클립 원본을 등록하세요.</p>
                                <select
                                  id="libraryClipVideoId"
                                  value={selectedVideo ?? ''}
                                onChange={(event) => {
                                  const { value } = event.target;
                                  if (value === '') {
                                    setSelectedVideo(null);
                                    return;
                                  }
                                  const parsed = Number(value);
                                  setSelectedVideo(Number.isNaN(parsed) ? null : parsed);
                                }}
                                disabled={creationDisabled || displayableVideos.length === 0}
                              >
                                  <option value="">선택 안 함</option>
                                  {clipSourceVideos.length > 0 && (
                                    <optgroup label="라이브/클립 원본">
                                      {clipSourceVideos.map((video) => (
                                        <option key={video.id} value={video.id}>
                                          {(video.title || video.youtubeVideoId) ?? video.youtubeVideoId} ·{' '}
                                          {describeVideoContentType(video.contentType)}
                                        </option>
                                      ))}
                                    </optgroup>
                                  )}
                                  {officialVideos.length > 0 && (
                                    <optgroup label="공식 영상">
                                      {officialVideos.map((video) => (
                                        <option key={video.id} value={video.id}>
                                          {(video.title || video.youtubeVideoId) ?? video.youtubeVideoId} ·{' '}
                                          {describeVideoContentType(video.contentType)}
                                        </option>
                                      ))}
                                    </optgroup>
                                  )}
                                </select>
                                {selectedVideoData?.sections && selectedVideoData.sections.length > 0 ? (
                                  <div className="section-preview">
                                    <p className="artist-preview__hint">구간을 클릭하면 시간이 자동으로 입력됩니다.</p>
                                    <ul className="video-item__sections">
                                      {selectedVideoData.sections.map((section, index) => (
                                        <li
                                          key={`${section.startSec}-${section.endSec}-${index}`}
                                          className="video-item__section"
                                          onClick={() => applyVideoSectionToClip(section, `구간 ${index + 1}`)}
                                          role="button"
                                          tabIndex={0}
                                          onKeyDown={(event) => {
                                            if (
                                              event.key === 'Enter' ||
                                              event.key === ' ' ||
                                              event.key === 'Space' ||
                                              event.key === 'Spacebar'
                                            ) {
                                              event.preventDefault();
                                              applyVideoSectionToClip(section, `구간 ${index + 1}`);
                                            }
                                          }}
                                        >
                                          <span className="video-item__section-time">
                                            {formatSeconds(section.startSec)} → {formatSeconds(section.endSec)}
                                          </span>
                                          <span className="video-item__section-title">
                                            {section.title || `구간 ${index + 1}`}
                                          </span>
                                          <span className="video-item__section-source">
                                            {describeSectionSource(section.source)}
                                          </span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                ) : (
                                  selectedVideo && (
                                    <p className="artist-preview__hint">
                                      저장된 구간이 없습니다. 아래에서 직접 시간을 입력하세요.
                                    </p>
                                  )
                                )}
                                <label htmlFor="libraryClipTitle">클립 제목</label>
                                <input
                                  id="libraryClipTitle"
                                  placeholder="클립 제목"
                                  value={clipForm.title}
                                  onChange={(event) =>
                                    setClipForm((prev) => ({ ...prev, title: event.target.value }))
                                  }
                                  required
                                  disabled={creationDisabled}
                                />
                                <div className="number-row">
                                  <div>
                                    <label htmlFor="libraryClipStartSec">시작 시간 (초)</label>
                                    <input
                                      id="libraryClipStartSec"
                                      type="number"
                                      min="0"
                                      value={clipForm.startSec}
                                      onChange={(event) =>
                                        setClipForm((prev) => ({ ...prev, startSec: Number(event.target.value) }))
                                      }
                                      required
                                      disabled={creationDisabled}
                                    />
                                  </div>
                                  <div>
                                    <label htmlFor="libraryClipEndSec">종료 시간 (초)</label>
                                    <input
                                      id="libraryClipEndSec"
                                      type="number"
                                      min="0"
                                      value={clipForm.endSec}
                                      onChange={(event) =>
                                        setClipForm((prev) => ({ ...prev, endSec: Number(event.target.value) }))
                                      }
                                      required
                                      disabled={creationDisabled}
                                    />
                                  </div>
                                </div>
                                <label htmlFor="libraryClipTags">태그 (쉼표로 구분)</label>
                                <input
                                  id="libraryClipTags"
                                  placeholder="예: 하이라이트, 라이브"
                                  value={clipForm.tags}
                                  onChange={(event) =>
                                    setClipForm((prev) => ({ ...prev, tags: event.target.value }))
                                  }
                                  disabled={creationDisabled}
                                />
                              </>
                            )}
                            <button type="submit" disabled={creationDisabled}>
                              {isClipRegistration ? '클립 등록' : '영상 메타데이터 저장'}
                            </button>
                          </form>
                          {isClipRegistration && (
                            <div className="clip-preview">
                              <h4>프리뷰</h4>
                              {selectedVideoData ? (
                                <>
                                  <p className="form-hint">
                                    {describeVideoContentType(selectedVideoData.contentType)} 영상 ·{' '}
                                    {selectedVideoData.title || selectedVideoData.youtubeVideoId}
                                  </p>
                                  <ClipPlayer
                                    youtubeVideoId={selectedVideoData.youtubeVideoId}
                                    startSec={previewStartSec}
                                    endSec={previewEndSec}
                                    autoplay={false}
                                  />
                                </>
                              ) : (
                                <p className="empty-state">클립 프리뷰를 확인하려면 영상을 선택하세요.</p>
                              )}
                            </div>
                          )}
                        </section>
                      )}
                      <section className="artist-library__detail-section">
                        <div className="artist-library__section-header">
                          <h4>등록된 영상</h4>
                          {isArtistVideosLoading ? (
                            <span className="artist-library__status">불러오는 중...</span>
                          ) : displayableVideos.length > 0 ? (
                            <span className="artist-library__status">{displayableVideos.length}개 영상</span>
                          ) : null}
                        </div>
                        {displayableVideos.length === 0 ? (
                          <p className="artist-library__empty">등록된 영상이 없습니다.</p>
                        ) : (
                          <ul className="artist-library__video-list">
                            {selectedVideoData && (
                              <li className="artist-library__video-preview">
                                <div className="artist-library__video-preview-meta">
                                  <span className="artist-library__video-preview-title">
                                    {selectedVideoData.title || selectedVideoData.youtubeVideoId || '제목 없는 영상'}
                                  </span>
                                  <span className="artist-library__video-preview-subtitle">
                                    {describeVideoContentType(selectedVideoData.contentType)} ·{' '}
                                    {formatSeconds(selectedVideoData.durationSec ?? 0)}
                                  </span>
                                </div>
                                {selectedVideoData.youtubeVideoId ? (
                                  <ClipPlayer
                                    youtubeVideoId={selectedVideoData.youtubeVideoId}
                                    startSec={0}
                                    endSec={
                                      selectedVideoData.durationSec && selectedVideoData.durationSec > 0
                                        ? selectedVideoData.durationSec
                                        : undefined
                                    }
                                  />
                                ) : (
                                  <p className="artist-library__video-preview-empty">
                                    유튜브 영상 정보가 없어 재생할 수 없습니다.
                                  </p>
                                )}
                              </li>
                            )}
                            {displayableVideos.map((video) => {
                              const isVideoSelected = selectedVideo === video.id;
                              const isVideoFavorited = favoriteVideoIds.includes(video.id);
                              const isVideoQueued = playlistVideoIds.includes(video.id);
                              const videoThumbnail =
                                video.thumbnailUrl ||
                                (video.youtubeVideoId
                                  ? `https://img.youtube.com/vi/${video.youtubeVideoId}/hqdefault.jpg`
                                  : null);
                              const videoTitle = video.title || video.youtubeVideoId || '제목 없는 영상';
                              return (
                                <li key={video.id} className="artist-library__video-item">
                                  <div
                                    role="button"
                                    tabIndex={0}
                                    className={`artist-library__video-button${isVideoSelected ? ' selected' : ''}`}
                                    onClick={() => handleLibraryVideoSelect(video.id)}
                                    onKeyDown={(event) => handleVideoCardKeyDown(event, video.id)}
                                    aria-pressed={isVideoSelected}
                                  >
                                    {videoThumbnail ? (
                                      <img
                                        className="artist-library__video-thumbnail"
                                        src={videoThumbnail}
                                        alt={`${videoTitle} 썸네일`}
                                        loading="lazy"
                                        decoding="async"
                                      />
                                    ) : (
                                      <div
                                        className="artist-library__video-thumbnail artist-library__video-thumbnail--placeholder"
                                        aria-hidden="true"
                                      >
                                        <span>썸네일 없음</span>
                                      </div>
                                    )}
                                    <div className="artist-library__video-meta">
                                      <span className="artist-library__video-title">{videoTitle}</span>
                                      <span className="artist-library__video-subtitle">
                                        {describeVideoContentType(video.contentType)} · {formatSeconds(video.durationSec ?? 0)}
                                      </span>
                                      <div className="artist-library__video-actions">
                                        <button
                                          type="button"
                                          className={`artist-library__video-action artist-library__video-action--favorite${
                                            isVideoFavorited ? ' active' : ''
                                          }`}
                                          aria-pressed={isVideoFavorited}
                                          aria-label={isVideoFavorited ? '즐겨찾기에서 제거' : '즐겨찾기에 추가'}
                                          onClick={(event) => {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            handleVideoFavoriteToggle(video.id);
                                          }}
                                        >
                                          {isVideoFavorited ? '★' : '☆'}
                                        </button>
                                        <button
                                          type="button"
                                          className={`artist-library__video-action artist-library__video-action--playlist${
                                            isVideoQueued ? ' active' : ''
                                          }`}
                                          aria-pressed={isVideoQueued}
                                          aria-label={isVideoQueued ? '재생목록에서 제거' : '재생목록에 추가'}
                                          onClick={(event) => {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            handleVideoPlaylistToggle(video.id);
                                          }}
                                        >
                                          {isVideoQueued ? '재생목록 추가됨' : '재생목록에 추가'}
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </section>
                      <section className="artist-library__detail-section">
                        <div className="artist-library__section-header">
                          <h4>클립</h4>
                          {selectedVideoData && (
                            <span className="artist-library__status">
                              {selectedVideoData.title || selectedVideoData.youtubeVideoId || '제목 없는 영상'}
                            </span>
                          )}
                        </div>
                        {selectedVideoClips.length === 0 ? (
                          selectedVideoData ? (
                            <p className="artist-library__empty">등록된 클립이 없습니다.</p>
                          ) : (
                            <p className="artist-library__empty">영상을 선택하면 클립을 확인할 수 있습니다.</p>
                          )
                        ) : (
                          <>
                            {selectedVideoIsHidden && (
                              <p className="artist-preview__hint">
                                댓글 구간에서 자동 저장된 클립입니다. 영상은 라이브러리에 등록되지 않습니다.
                              </p>
                            )}
                            <ul className="artist-library__clip-list">
                              {selectedVideoClips.map((clip) => {
                                const isActive = activeClipId === clip.id;
                                const hasYoutubeId = Boolean(clip.youtubeVideoId);
                                return (
                                  <li
                                    key={clip.id}
                                    className={`artist-library__clip-card${
                                      isActive ? ' artist-library__clip-card--active' : ''
                                    }${hasYoutubeId ? '' : ' artist-library__clip-card--disabled'}`}
                                  >
                                    <button
                                      type="button"
                                      className="artist-library__clip-card-button"
                                      onClick={() => handleClipCardToggle(clip)}
                                      aria-pressed={isActive}
                                      disabled={!hasYoutubeId}
                                    >
                                      <span className="artist-library__clip-title">{clip.title}</span>
                                      <span className="artist-library__clip-time">
                                        {formatSeconds(clip.startSec)} → {formatSeconds(clip.endSec)}
                                      </span>
                                      {clip.tags.length > 0 && (
                                        <div className="artist-library__clip-tags">
                                          {clip.tags.map((tag) => (
                                            <span key={tag} className="tag">
                                              #{tag}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    </button>
                                    {clip.youtubeVideoId && (
                                      <div className="artist-library__clip-footer">
                                        <a
                                          className="artist-library__clip-link"
                                          href={`https://www.youtube.com/watch?v=${clip.youtubeVideoId}&t=${Math.floor(clip.startSec)}s`}
                                          target="_blank"
                                          rel="noreferrer"
                                          onClick={(event) => event.stopPropagation()}
                                        >
                                          유튜브에서 보기
                                        </a>
                                      </div>
                                    )}
                                    {isActive && clip.youtubeVideoId && (
                                      <div className="artist-library__clip-player">
                                        <ClipPlayer
                                          youtubeVideoId={clip.youtubeVideoId}
                                          startSec={clip.startSec}
                                          endSec={clip.endSec}
                                          autoplay
                                        />
                                      </div>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          </>
                        )}
                      </section>
                    </div>
                  </div>
                ) : noFilteredArtists ? (
                  <div className="artist-empty">검색 결과가 없습니다.</div>
                ) : (
                  <div className="artist-library__grid" role="list">
                    {artistList.map((artist) => {
                      const rawArtist = artist as any;
                      const artistId = Number(rawArtist.id ?? 0);
                      return (
                        <ArtistLibraryCard
                          key={artistId}
                          artist={artist}
                          isActive={selectedArtistId === artistId}
                          onSelect={() => handleArtistClick(artistId)}
                        />
                      );
                    })}
                  </div>
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
            </div>
          </section>

          <section
            className={`content-panel${activeSection === 'playlist' ? ' active' : ''}`}
            role="tabpanel"
            aria-labelledby="sidebar-tab-playlist"
            hidden={activeSection !== 'playlist'}
          >
            <div className="panel playlist-panel">
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
            </div>
          </section>
        </div>
      </main>

      <SignupPopup
        open={isSignupPopupOpen}
        onClose={closeSignupPopup}
        email={emailRegisterEmail}
        onEmailChange={setEmailRegisterEmail}
        phase={emailRegisterPhase}
        onRequestCode={handleEmailRegisterRequest}
        code={emailRegisterCode}
        onCodeChange={setEmailRegisterCode}
        password={emailRegisterPassword}
        onPasswordChange={setEmailRegisterPassword}
        passwordConfirm={emailRegisterPasswordConfirm}
        onPasswordConfirmChange={setEmailRegisterPasswordConfirm}
        onVerify={handleEmailRegisterVerify}
        message={emailRegisterMessage}
        error={emailRegisterError}
        debugCode={emailRegisterDebugCode}
      />
    </div>
  );
}
