import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

interface ArtistResponse {
  id: number;
  name: string;
  displayName: string;
  youtubeChannelId: string;
  profileImageUrl?: string | null;
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
  sections?: VideoSectionResponse[];
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
}

interface ArtistPreviewResponse {
  channelId: string | null;
  profileImageUrl: string | null;
  title: string | null;
  channelUrl: string | null;
  debug: ArtistPreviewDebug | null;
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
  const [clips, setClips] = useState<ClipResponse[]>([]);
  const [publicClips, setPublicClips] = useState<ClipResponse[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<number | null>(null);
  const [clipCandidates, setClipCandidates] = useState<ClipCandidateResponse[]>([]);
  const [isFetchingVideoSections, setIsFetchingVideoSections] = useState(false);
  const [videoSectionPreview, setVideoSectionPreview] = useState<VideoSectionResponse[]>([]);
  const [videoSectionPreviewError, setVideoSectionPreviewError] = useState<string | null>(null);
  const [hasAttemptedVideoSectionPreview, setHasAttemptedVideoSectionPreview] = useState(false);
  const [artistForm, setArtistForm] = useState({ name: '', channelId: '' });
  const [videoForm, setVideoForm] = useState({ url: '', artistId: '', description: '', captionsJson: '' });
  const [clipForm, setClipForm] = useState({ title: '', startSec: 0, endSec: 0, tags: '' });
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

  const handleSignOut = () => {
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
    setClipForm({ title: '', startSec: 0, endSec: 0, tags: '' });
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
  };

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
    if (!trimmedName || !trimmedChannelId) {
      return;
    }

    if (!artistPreviewReady || !artistPreview || artistPreview.inputChannel !== trimmedChannelId) {
      setArtistPreviewLoading(true);
      setArtistPreviewError(null);
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
          request: { channelId: trimmedChannelId, name: trimmedName },
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
          request: { channelId: trimmedChannelId, name: trimmedName },
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
        { name: trimmedName, displayName: trimmedName, youtubeChannelId: trimmedChannelId },
        { headers: authHeaders }
      );
      setArtistForm({ name: '', channelId: '' });
      setArtistPreview(null);
      setArtistPreviewReady(false);
      setArtistPreviewError(null);
      appendArtistDebugLog({
        timestamp: new Date().toISOString(),
        type: 'create-success',
        request: { channelId: trimmedChannelId, name: trimmedName },
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
        request: { channelId: trimmedChannelId, name: trimmedName },
        error: message,
        response: responseData
      });
    }
  };

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

  const applyVideoSectionToClip = useCallback(
    (section: VideoSectionResponse, fallbackTitle: string) => {
      setClipForm((prev) => ({
        ...prev,
        title: prev.title || section.title || fallbackTitle,
        startSec: section.startSec,
        endSec: section.endSec
      }));
    },
    []
  );

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
      setVideoSectionPreview([]);
      setVideoSectionPreviewError(null);
      setHasAttemptedVideoSectionPreview(false);
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
    if (!videoForm.artistId) {
      setVideos([]);
      setSelectedVideo(null);
      setArtistVideosLoading(false);
      return;
    }

    let cancelled = false;
    setArtistVideosLoading(true);

    (async () => {
      try {
        const response = await http.get<VideoResponse[]>('/videos', {
          headers: authHeaders,
          params: { artistId: Number(videoForm.artistId) }
        });

        if (cancelled) {
          return;
        }

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
        if (!cancelled) {
          setVideos([]);
          setSelectedVideo(null);
        }
      } finally {
        if (!cancelled) {
          setArtistVideosLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [videoForm.artistId, authHeaders]);

  const handleArtistClick = (artistId: number) => {
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
  const previewStartSec = Math.max(0, Number(clipForm.startSec) || 0);
  const fallbackEnd = selectedVideoData?.durationSec
    ? Math.min(selectedVideoData.durationSec, previewStartSec + 30)
    : previewStartSec + 30;
  const previewEndSec = Number(clipForm.endSec) > previewStartSec ? Number(clipForm.endSec) : fallbackEnd;

  const [activeSection, setActiveSection] = useState<SectionKey>('library');

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
      setActiveSection('mypage');
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
                      <h3>영상 등록</h3>
                      <form onSubmit={handleVideoSubmit} className="stacked-form">
                        <label htmlFor="videoUrl">YouTube 영상 URL</label>
                        <div className="number-row">
                          <input
                            id="videoUrl"
                            placeholder="https://www.youtube.com/watch?v=..."
                            value={videoForm.url}
                            onChange={(event) => setVideoForm((prev) => ({ ...prev, url: event.target.value }))}
                            required
                            disabled={creationDisabled}
                          />
                          <button
                            type="button"
                            onClick={handleVideoSectionPreviewFetch}
                            disabled={creationDisabled || isFetchingVideoSections}
                          >
                            {isFetchingVideoSections ? '구간 불러오는 중...' : '구간 불러오기'}
                          </button>
                        </div>
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
                                <li key={`${section.startSec}-${section.endSec}-${index}`} className="video-item__section">
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
                        <label htmlFor="videoArtistId">아티스트 선택</label>
                        <select
                          id="videoArtistId"
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
                        <button type="submit" disabled={creationDisabled}>
                          영상 메타데이터 저장
                        </button>
                      </form>
                    </div>
                    <div className="management-section">
                      <h3>새로운 클립 등록</h3>
                      <form onSubmit={handleClipSubmit} className="stacked-form">
                        <label htmlFor="clipVideoId">영상 선택</label>
                        <select
                          id="clipVideoId"
                          value={selectedVideo ?? ''}
                          onChange={(event) => {
                            const value = Number(event.target.value);
                            setSelectedVideo(Number.isNaN(value) ? null : value);
                          }}
                          required
                          disabled={creationDisabled || videos.length === 0}
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
                        <button type="submit" disabled={creationDisabled}>
                          클립 등록
                        </button>
                      </form>
                      <div className="clip-preview">
                        <h4>프리뷰</h4>
                        {selectedVideoData ? (
                          <ClipPlayer
                            youtubeVideoId={selectedVideoData.youtubeVideoId}
                            startSec={previewStartSec}
                            endSec={previewEndSec}
                            autoplay={false}
                          />
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
                              const value = Number(event.target.value);
                              setSelectedVideo(Number.isNaN(value) ? null : value);
                            }}
                            disabled={creationDisabled || videos.length === 0}
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
              <div className="media-grid">
                <div className="media-card highlight-card">
                  <div className="highlight-header">
                    <span className="highlight-badge">추천</span>
                    <h2>클립 만들기</h2>
                  </div>
                  <p className="highlight-description">
                    신규 영상에서 하이라이트 구간을 선택하고 태그와 함께 저장해보세요.
                  </p>
                  <div className="highlight-player">
                    {selectedVideoData ? (
                      <ClipPlayer
                        youtubeVideoId={selectedVideoData.youtubeVideoId}
                        startSec={previewStartSec}
                        endSec={previewEndSec}
                        autoplay={false}
                      />
                    ) : (
                      <div className="empty-state">
                        좌측 탭에서 영상을 선택하면 미리보기가 표시됩니다.
                      </div>
                    )}
                  </div>
                  <div className="highlight-meta">
                    <span>{selectedVideoData?.title || '영상이 선택되지 않았습니다'}</span>
                    {selectedVideoData?.durationSec && <span>{selectedVideoData.durationSec}초</span>}
                  </div>
                </div>

                <div className="media-card artist-explorer">
                  <div className="artist-explorer__header">
                    <div>
                      <h3>아티스트 디렉토리</h3>
                      <p className="artist-directory__subtitle">전체 이용자가 확인할 수 있는 공개 목록입니다.</p>
                    </div>
                    {selectedArtist && (
                      <div className="artist-explorer__header-meta">
                        <span>선택된 아티스트</span>
                        <strong>{selectedArtist.displayName || selectedArtist.name}</strong>
                      </div>
                    )}
                  </div>
                  <div className="artist-explorer__content">
                    <div className="artist-explorer__list" role="listbox" aria-label="아티스트 목록">
                      {artists.length === 0 ? (
                        <div className="artist-empty">등록된 아티스트가 없습니다.</div>
                      ) : (
                        <ul className="artist-directory__list">
                          {artists.map((artist) => {
                            const isActive = selectedArtist?.id === artist.id;
                            const fallbackAvatarUrl = `https://ui-avatars.com/api/?background=111827&color=e2e8f0&name=${encodeURIComponent(
                              artist.displayName || artist.name
                            )}`;
                            return (
                              <li
                                key={artist.id}
                                className={`artist-directory__item${isActive ? ' active' : ''}`}
                                onClick={() => handleArtistClick(artist.id)}
                                role="option"
                                aria-selected={isActive}
                              >
                                <div className="artist-directory__avatar">
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
                                <div className="artist-directory__meta">
                                  <span className="artist-directory__name">{artist.displayName || artist.name}</span>
                                  <span className="artist-directory__channel">{artist.youtubeChannelId}</span>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>

                    <div className="artist-explorer__detail">
                      {selectedArtist ? (
                        <div className="artist-detail">
                          <div className="artist-detail__header">
                            <div className="artist-detail__avatar">
                              {selectedArtist.profileImageUrl ? (
                                <img
                                  src={selectedArtist.profileImageUrl}
                                  alt={`${selectedArtist.displayName || selectedArtist.name} 채널 프로필 이미지`}
                                  loading="lazy"
                                  decoding="async"
                                  referrerPolicy="no-referrer"
                                  onError={(event) => {
                                    const fallbackUrl = `https://ui-avatars.com/api/?background=111827&color=e2e8f0&name=${encodeURIComponent(
                                      selectedArtist.displayName || selectedArtist.name
                                    )}`;
                                    if (event.currentTarget.src !== fallbackUrl) {
                                      event.currentTarget.src = fallbackUrl;
                                    }
                                  }}
                                />
                              ) : (
                                <img
                                  src={`https://ui-avatars.com/api/?background=111827&color=e2e8f0&name=${encodeURIComponent(
                                    selectedArtist.displayName || selectedArtist.name
                                  )}`}
                                  alt={`${selectedArtist.displayName || selectedArtist.name} 기본 프로필 이미지`}
                                  loading="lazy"
                                  decoding="async"
                                />
                              )}
                            </div>
                            <div className="artist-detail__info">
                              <h4>{selectedArtist.displayName || selectedArtist.name}</h4>
                              <p>{selectedArtist.youtubeChannelId}</p>
                              {selectedArtist.youtubeChannelId && (
                                <a
                                  href={selectedArtist.youtubeChannelId.startsWith('@')
                                    ? `https://www.youtube.com/${selectedArtist.youtubeChannelId}`
                                    : `https://www.youtube.com/channel/${selectedArtist.youtubeChannelId}`}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  유튜브 채널 보기
                                </a>
                              )}
                            </div>
                          </div>
                          <div className="artist-detail__videos">
                            <div className="artist-detail__videos-header">
                              <h5>등록된 영상</h5>
                              {isArtistVideosLoading && <span className="artist-detail__loading">불러오는 중...</span>}
                            </div>
                            {isArtistVideosLoading ? (
                              <p className="empty-state">영상 정보를 불러오는 중입니다.</p>
                            ) : videos.length === 0 ? (
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
                                      <div className="video-item__info">
                                        <h4>{video.title || video.youtubeVideoId}</h4>
                                        <p>{video.youtubeVideoId}</p>
                                        {Array.isArray(video.sections) && video.sections.length > 0 && (
                                          <ul className="video-item__sections">
                                            {video.sections.map((section, index) => (
                                              <li
                                                key={`${section.startSec}-${section.endSec}-${index}`}
                                                className="video-item__section"
                                              >
                                                <span className="video-item__section-time">
                                                  {formatSeconds(section.startSec)} → {formatSeconds(section.endSec)}
                                                </span>
                                                <span className="video-item__section-title">{section.title}</span>
                                                <span className="video-item__section-source">
                                                  {describeSectionSource(section.source)}
                                                </span>
                                              </li>
                                            ))}
                                          </ul>
                                        )}
                                      </div>
                                      {video.thumbnailUrl && (
                                        <img
                                          src={video.thumbnailUrl}
                                          alt="Video thumbnail"
                                          loading="lazy"
                                          decoding="async"
                                        />
                                      )}
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="artist-detail__empty">
                          <h4>아티스트를 선택해 주세요</h4>
                          <p>좌측 목록에서 아티스트를 선택하면 등록된 영상과 채널 정보를 확인할 수 있습니다.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
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
