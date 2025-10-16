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

interface ArtistResponse {
  id: number;
  name: string;
  displayName: string;
  youtubeChannelId: string;
  profileImageUrl?: string | null;
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
  const [artistForm, setArtistForm] = useState({ name: '', channelId: '' });
  const [videoForm, setVideoForm] = useState({ url: '', artistId: '', description: '', captionsJson: '' });
  const [clipForm, setClipForm] = useState({ title: '', startSec: 0, endSec: 0, tags: '' });
  const [autoDetectMode, setAutoDetectMode] = useState('chapters');
  const [isGoogleReady, setIsGoogleReady] = useState(false);
  const [emailRegisterEmail, setEmailRegisterEmail] = useState('');
  const [emailRegisterCode, setEmailRegisterCode] = useState('');
  const [emailRegisterPassword, setEmailRegisterPassword] = useState('');
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
  const [activeManagementTab, setActiveManagementTab] = useState<'clips' | 'videos' | 'artists'>('clips');

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
      setVideos([]);
      setClips([]);
      setClipCandidates([]);
      setSelectedVideo(null);
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
                  className={activeManagementTab === 'clips' ? 'active' : ''}
                  onClick={() => setActiveManagementTab('clips')}
                >
                  클립 등록
                </button>
                <button
                  type="button"
                  className={activeManagementTab === 'videos' ? 'active' : ''}
                  onClick={() => setActiveManagementTab('videos')}
                >
                  영상 등록
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
                {activeManagementTab === 'clips' && (
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
                )}
                {activeManagementTab === 'videos' && (
                  <div className="management-section">
                    <h3>영상 등록</h3>
                    <form onSubmit={handleVideoSubmit} className="stacked-form">
                      <label htmlFor="videoUrl">YouTube 영상 URL</label>
                      <input
                        id="videoUrl"
                        placeholder="https://www.youtube.com/watch?v=..."
                        value={videoForm.url}
                        onChange={(event) => setVideoForm((prev) => ({ ...prev, url: event.target.value }))}
                        required
                        disabled={creationDisabled}
                      />
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
                      <label htmlFor="videoDescription">영상 설명 (선택)</label>
                      <textarea
                        id="videoDescription"
                        rows={3}
                        placeholder="영상 설명을 입력하거나 붙여넣기하세요."
                        value={videoForm.description}
                        onChange={(event) =>
                          setVideoForm((prev) => ({ ...prev, description: event.target.value }))
                        }
                        disabled={creationDisabled}
                      />
                      <label htmlFor="videoCaptions">캡션 JSON 또는 시작시간|문장</label>
                      <textarea
                        id="videoCaptions"
                        rows={3}
                        placeholder={'[{"start":0,"text":"문장"}] 또는 12|첫 문장'}
                        value={videoForm.captionsJson}
                        onChange={(event) =>
                          setVideoForm((prev) => ({ ...prev, captionsJson: event.target.value }))
                        }
                        disabled={creationDisabled}
                      />
                      <button type="submit" disabled={creationDisabled}>
                        영상 메타데이터 저장
                      </button>
                    </form>
                  </div>
                )}
                {activeManagementTab === 'artists' && (
                  <div className="management-section">
                    <h3>아티스트 등록</h3>
                    <form onSubmit={handleArtistSubmit} className="stacked-form">
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
                      <button type="submit" disabled={creationDisabled}>
                        아티스트 등록
                      </button>
                    </form>
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

                <div className="media-card artist-directory">
                  <h3>아티스트 디렉토리</h3>
                  <p className="artist-directory__subtitle">전체 이용자가 확인할 수 있는 공개 목록입니다.</p>
                  <ul className="artist-directory__list">
                    {artists.length === 0 ? (
                      <li className="artist-empty">등록된 아티스트가 없습니다.</li>
                    ) : (
                      artists.map((artist) => {
                        const isActive = selectedArtist?.id === artist.id;
                        return (
                          <li
                            key={artist.id}
                            className={`artist-directory__item${isActive ? ' active' : ''}`}
                            onClick={() => handleArtistClick(artist.id)}
                          >
                            <div className="artist-directory__avatar">
                              {artist.profileImageUrl ? (
                                <img
                                  src={artist.profileImageUrl}
                                  alt={`${artist.displayName || artist.name} 채널 프로필 이미지`}
                                  loading="lazy"
                                />
                              ) : (
                                <span className="artist-directory__icon" aria-hidden="true">
                                  <svg viewBox="0 0 24 24" role="presentation">
                                    <path d="M21.8 8.001a2.5 2.5 0 0 0-1.758-1.77C18.25 6 12 6 12 6s-6.25 0-8.042.231a2.5 2.5 0 0 0-1.758 1.77C2 9.801 2 12 2 12s0 2.199.2 3.999a2.5 2.5 0 0 0 1.758 1.77C5.75 18 12 18 12 18s6.25 0 8.042-.231a2.5 2.5 0 0 0 1.758-1.77C22 14.199 22 12 22 12s0-2.199-.2-3.999Z" />
                                    <path d="M10 14.5v-5l4.5 2.5Z" fill="currentColor" />
                                  </svg>
                                </span>
                              )}
                            </div>
                            <div className="artist-directory__meta">
                              <span className="artist-directory__name">{artist.displayName || artist.name}</span>
                              <span className="artist-directory__channel">{artist.youtubeChannelId}</span>
                            </div>
                          </li>
                        );
                      })
                    )}
                  </ul>
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
