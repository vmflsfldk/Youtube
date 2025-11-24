import {
  ChangeEvent,
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  RefObject,
  Suspense,
  lazy,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import type { YouTubePlayer } from 'react-youtube';
import axios from 'axios';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import ClipList, { type ClipListRenderContext, type ClipListRenderResult } from './components/ClipList';
import PlaylistBar, {
  type PlaybackRepeatMode,
  type PlaylistBarItem
} from './components/PlaylistBar';
import AuthPanel from './components/AuthPanel';
import LanguageToggle from './components/LanguageToggle';
import utahubLogo from './assets/utahub-logo.svg';
import ArtistLibraryGrid from './ArtistLibraryGrid';
import ArtistLibraryCard, { type ArtistLibraryCardData } from './components/ArtistLibraryCard';
import ArtistSearchControls from './components/ArtistSearchControls';
import ClipPreviewPanel from './components/ClipPreviewPanel';
import SongCatalogTable from './components/SongCatalogTable';
import PlaylistWidgetControls from './components/PlaylistWidgetControls';
import type {
  VideoChannelResolutionResponse,
  VideoResponse,
  VideoSectionResponse
} from './types/media';
import type { ArtistResponse, LiveArtistResponse, LiveBroadcastResponse } from './types/artists';
import {
  extractYouTubeVideoId,
  isClipSourceVideo,
  mergeVideoIntoCollections,
  normalizeVideo
} from './utils/videos';
import { useTranslations } from './locales/translations';
import { createReloadArtistVideos } from './library/reloadArtistVideos';
import { mediaMatchesArtist } from './library/mediaMatchesArtist';
import VideoLinkInput from './components/VideoLinkInput';

const ClipPlayer = lazy(() => import('./components/ClipPlayer'));

/* --- SVG Icons (X Style) --- */
const HomeIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 1.696.622 8.807l1.06 1.696L3 9.679V19.5C3 20.881 4.119 22 5.5 22h13c1.381 0 2.5-1.119 2.5-2.5V9.679l1.318.824 1.06-1.696L12 1.696Zm0 14.804a3.5 3.5 0 1 1 3.5-3.5 3.5 3.5 0 0 1-3.5 3.5Z" />
  </svg>
);

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M10.25 3.75a6.5 6.5 0 1 0 4.596 11.096l6.798 6.799-1.768 1.768-6.799-6.798A6.47 6.47 0 0 1 10.25 16a6.5 6.5 0 1 0 0-13Z" />
  </svg>
);

const LibraryIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M3 3v18h18V3Zm16 16H5V5h14ZM7 7h2v2H7Zm4 0h6v2h-6Zm-4 4h2v2H7Zm4 0h6v2h-6Zm-4 4h2v2H7Zm4 0h6v2h-6Z" />
  </svg>
);

const LiveIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 12.5a2.5 2.5 0 1 1 2.5-2.5 2.5 2.5 0 0 1-2.5 2.5Zm0-7a4.5 4.5 0 1 0 4.5 4.5A4.5 4.5 0 0 0 12 5.5ZM2.06 10C2.06 4.51 6.51.06 12 .06S21.94 4.51 21.94 10a9.9 9.9 0 0 1-2.91 7.03l-1.43-1.43a8 8 0 1 0-9.2 0l-1.43 1.43A9.9 9.9 0 0 1 2.06 10Z" />
  </svg>
);

type MaybeArray<T> =
  | T[]
  | { items?: T[]; data?: T[]; results?: T[] }
  | null
  | undefined;

const VIDEO_CATEGORY_ORDER = ['cover', 'live', 'original'] as const;

type VideoCategoryKey = (typeof VIDEO_CATEGORY_ORDER)[number];
type VideoCategorySelection = '' | VideoCategoryKey;

const LATEST_VIDEO_LIMIT = 20;
const LATEST_CLIP_LIMIT = 20;

const resolveDescendingSortValue = (
  createdAt: string | null | undefined,
  fallback: number
): number => {
  if (typeof createdAt === 'string') {
    const timestamp = Date.parse(createdAt);
    if (!Number.isNaN(timestamp)) {
      return timestamp;
    }
  }
  return fallback;
};

const VIDEO_CATEGORY_LABELS: Record<VideoCategoryKey, string> = {
  cover: '커버',
  live: '라이브',
  original: '오리지널'
};

const isRecognizedVideoCategoryValue = (value: string): value is VideoCategoryKey =>
  (VIDEO_CATEGORY_ORDER as readonly string[]).includes(value);

type ClipTimeField =
  | 'startHours'
  | 'startMinutes'
  | 'startSeconds'
  | 'endHours'
  | 'endMinutes'
  | 'endSeconds';

type ClipTimePrefix = 'start' | 'end';

type ClipFormState = {
  title: string;
  startHours: string;
  startMinutes: string;
  startSeconds: string;
  endHours: string;
  endMinutes: string;
  endSeconds: string;
  tags: string;
  tagInput: string;
  videoUrl: string;
  originalComposer: string;
};

const createInitialClipFormState = (): ClipFormState => ({
  title: '',
  startHours: '0',
  startMinutes: '00',
  startSeconds: '00',
  endHours: '0',
  endMinutes: '00',
  endSeconds: '00',
  tags: '',
  tagInput: '',
  videoUrl: '',
  originalComposer: ''
});

type ClipEditFormState = {
  clipId: number | null;
  startHours: string;
  startMinutes: string;
  startSeconds: string;
  endHours: string;
  endMinutes: string;
  endSeconds: string;
};

const createInitialClipEditFormState = (): ClipEditFormState => ({
  clipId: null,
  startHours: '0',
  startMinutes: '00',
  startSeconds: '00',
  endHours: '0',
  endMinutes: '00',
  endSeconds: '00'
});

type VideoFormState = {
  url: string;
  artistId: string;
  description: string;
  captionsJson: string;
  originalComposer: string;
  category: VideoCategorySelection;
};

const createInitialVideoFormState = (): VideoFormState => ({
  url: '',
  artistId: '',
  description: '',
  captionsJson: '',
  originalComposer: '',
  category: ''
});

type VideoCategoryMutationStatus =
  | { state: 'saving' }
  | { state: 'success'; message: string }
  | { state: 'error'; message: string };

type VideoMetadataDraftState = {
  title: string;
  originalComposer: string;
};

type VideoMetadataMutationStatus =
  | { state: 'saving' }
  | { state: 'success'; message: string }
  | { state: 'error'; message: string }
  | { state: 'info'; message: string };

type ToastTone = 'info' | 'success' | 'error';

type ToastMessage = {
  id: string;
  message: string;
  tone: ToastTone;
};

export type ArtistSearchMode = 'all' | 'name' | 'tag';

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
  const safeValue = Number.isFinite(value) ? Math.max(value, 0) : 0;
  const roundedToTenth = Math.round(safeValue * 10) / 10;
  const wholeSeconds = Math.floor(roundedToTenth);
  const fractional = Math.round((roundedToTenth - wholeSeconds) * 10) / 10;

  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const seconds = wholeSeconds % 60;

  const secondsDisplay = fractional > 0 ? (seconds + fractional).toFixed(1) : seconds.toString();
  const paddedSeconds = secondsDisplay.includes('.')
    ? secondsDisplay.padStart(4, '0')
    : secondsDisplay.padStart(2, '0');
  const minutePart = minutes.toString().padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${minutePart}:${paddedSeconds}`;
  }
  return `${minutes}:${paddedSeconds}`;
};

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

const CLIP_NUDGE_STEP = 0.5;
const CLIP_NUDGE_LARGE_STEP = 1;
const CLIP_KEYBOARD_STEP = 0.1;
const normalizeClipSeconds = (value: number) => Math.round(value * 10) / 10;

export { mediaMatchesArtist } from './library/mediaMatchesArtist';

const sanitizeTimePartInput = (
  value: string,
  options: { maxLength?: number | null; maxValue?: number | null; allowDecimal?: boolean }
) => {
  const filtered = options.allowDecimal ? value.replace(/[^0-9.]/g, '') : value.replace(/\D/g, '');
  const sanitized = options.allowDecimal ? filtered.replace(/(\..*)\./g, '$1') : filtered;
  const truncated = options.maxLength ? sanitized.slice(0, options.maxLength) : sanitized;

  if (truncated === '' || truncated === '.') {
    return '';
  }

  const numeric = Number(truncated);
  if (!Number.isFinite(numeric)) {
    return '';
  }

  if (typeof options.maxValue === 'number') {
    return clamp(numeric, 0, options.maxValue).toString();
  }

  return numeric.toString();
};

const parseClipTimeParts = (hours: string, minutes: string, seconds: string): number => {
  const parsePart = (value: string, max?: number): number => {
    if (!value) {
      return 0;
    }
    const numeric = Number(value.replace(/(\..*)\./g, '$1'));
    if (!Number.isFinite(numeric) || numeric < 0) {
      return 0;
    }
    if (typeof max === 'number') {
      return clamp(numeric, 0, max);
    }
    return numeric;
  };

  const hourValue = parsePart(hours);
  const minuteValue = parsePart(minutes, 59);
  const secondValue = parsePart(seconds, 59.9);

  return hourValue * 3600 + minuteValue * 60 + secondValue;
};

const createClipTimePartValues = (totalSeconds: number) => {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return { hours: '0', minutes: '00', seconds: '00' } as const;
  }

  const total = Math.round(totalSeconds * 10) / 10;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = Math.round((total - hours * 3600 - minutes * 60) * 10) / 10;
  const secondsDisplay = Number.isInteger(seconds)
    ? Math.floor(seconds).toString().padStart(2, '0')
    : seconds.toFixed(1).padStart(4, '0');

  return {
    hours: hours.toString(),
    minutes: minutes.toString().padStart(2, '0'),
    seconds: secondsDisplay
  } as const;
};

const createClipTimePatch = (
  parts: ReturnType<typeof createClipTimePartValues>,
  prefix: ClipTimePrefix
) =>
  prefix === 'start'
    ? { startHours: parts.hours, startMinutes: parts.minutes, startSeconds: parts.seconds }
    : { endHours: parts.hours, endMinutes: parts.minutes, endSeconds: parts.seconds };

const createEmptyClipTimePatch = (prefix: ClipTimePrefix) =>
  prefix === 'start'
    ? { startHours: '', startMinutes: '', startSeconds: '' }
    : { endHours: '', endMinutes: '', endSeconds: '' };

const sanitizeSecondsInput = (value: string, maxLength = 6): string =>
  value.replace(/\D/g, '').slice(0, maxLength);

const isActivationKey = (key: string): boolean =>
  key === 'Enter' || key === ' ' || key === 'Space' || key === 'Spacebar';

const handleInteractiveListItemKeyDown = (
  event: ReactKeyboardEvent<HTMLElement>,
  action: () => void
) => {
  if (isActivationKey(event.key)) {
    event.preventDefault();
    action();
  }
};

const describeSectionSource = (source?: string): string => {
  switch ((source ?? '').toUpperCase()) {
    case 'COMMENT':
      return '댓글';
    case 'VIDEO_DESCRIPTION':
      return '영상 설명';
    case 'YOUTUBE_CHAPTER':
      return '유튜브 챕터';
    case 'AUTO_DETECTED':
      return '자동 감지';
    default:
      return '기타';
  }
};

const AUTO_DETECTED_SECTION_SOURCE = 'AUTO_DETECTED';

const mergeSections = (
  existing: VideoSectionResponse[],
  additions: VideoSectionResponse[]
): VideoSectionResponse[] => {
  if (additions.length === 0) {
    return existing.slice();
  }

  const merged = existing.slice();
  const seen = new Set(merged.map((section) => `${section.startSec}-${section.endSec}`));

  additions.forEach((section) => {
    const key = `${section.startSec}-${section.endSec}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    merged.push(section);
  });

  merged.sort((a, b) => a.startSec - b.startSec);
  return merged;
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

const describeVideoCategory = (category?: string | null): string | null => {
  if (!category) {
    return null;
  }
  const normalized = category.trim().toLowerCase();
  if (isRecognizedVideoCategoryValue(normalized)) {
    return VIDEO_CATEGORY_LABELS[normalized];
  }
  return null;
};

type MediaRegistrationType = 'video' | 'clip';

type ArtistLibraryView = 'videoForm' | 'clipForm' | 'videoList' | 'clipList';

const resolveMediaRegistrationType = (
  url: string,
  selectedVideoId: number | null
): MediaRegistrationType => {
  const normalized = url.trim().toLowerCase();

  if (normalized.includes('live')) {
    return 'clip';
  }

  if (normalized.length > 0) {
    return 'video';
  }

  return selectedVideoId !== null ? 'clip' : 'video';
};

const VIDEO_FILTER_KEYWORDS = ['cover', 'original', 'official'];

const VIDEO_CATEGORY_METADATA: ReadonlyArray<{ key: VideoCategoryKey; label: string }> =
  VIDEO_CATEGORY_ORDER.map((key) => ({ key, label: VIDEO_CATEGORY_LABELS[key] }));

const VIDEO_CATEGORY_OPTIONS: ReadonlyArray<{ value: VideoCategorySelection; label: string }> = [
  { value: '', label: '자동 분류 (제목 기반)' },
  ...VIDEO_CATEGORY_ORDER.map((key) => ({ value: key, label: VIDEO_CATEGORY_LABELS[key] }))
];

const VIDEO_CATEGORY_CUSTOM_VALUE = '__custom' as const;

const VIDEO_CATEGORY_KEYWORDS: Record<VideoCategoryKey, string[]> = {
  cover: ['cover', '커버', 'カバー'],
  live: ['live', '라이브', 'ライブ', '生放送', '歌枠'],
  original: ['original', '오리지널', 'オリジナル']
};

const normalizeText = (value?: string | null): string => (value ?? '').toLowerCase();

const categorizeVideo = (video: VideoResponse): VideoCategoryKey => {
  const normalizedCategory = normalizeText(video.category);
  if (isRecognizedVideoCategoryValue(normalizedCategory)) {
    return normalizedCategory;
  }
  const normalizedTitle = normalizeText(video.title);
  const normalizedId = normalizeText(video.youtubeVideoId);
  const contentType = (video.contentType ?? '').toUpperCase();
  const matchesKeywords = (key: VideoCategoryKey) =>
    VIDEO_CATEGORY_KEYWORDS[key].some(
      (keyword) => keyword && (normalizedTitle.includes(keyword) || normalizedId.includes(keyword))
    );

  if (matchesKeywords('cover')) {
    return 'cover';
  }

  if (contentType === 'CLIP_SOURCE' || matchesKeywords('live')) {
    return 'live';
  }

  if (contentType === 'OFFICIAL' || matchesKeywords('original') || normalizedId.includes('official')) {
    return 'original';
  }

  return 'original';
};

const matchCategoryKeyword = (value: string, key: VideoCategoryKey): boolean =>
  VIDEO_CATEGORY_KEYWORDS[key].some((keyword) => keyword && value.includes(keyword));

const extractSongTitleFromTags = (tags?: string[]): string | null => {
  if (!Array.isArray(tags)) {
    return null;
  }
  for (const tag of tags) {
    if (typeof tag !== 'string') {
      continue;
    }
    const trimmed = tag.trim();
    if (!trimmed) {
      continue;
    }
    const lower = trimmed.toLowerCase();
    if (lower.startsWith('곡:')) {
      return trimmed.slice(2).trim();
    }
    if (lower.startsWith('song:')) {
      return trimmed.slice(5).trim();
    }
    if (lower.startsWith('title:')) {
      return trimmed.slice(6).trim();
    }
  }
  return null;
};

const formatSongTitle = (
  title: string | null | undefined,
  options: { tags?: string[]; fallback?: string } = {}
): string => {
  const fallback = typeof options.fallback === 'string' ? options.fallback : '';
  const tagTitle = extractSongTitleFromTags(options.tags);
  const baseTitle = tagTitle || (typeof title === 'string' ? title : '') || fallback;

  let sanitized = baseTitle
    .replace(/\[[^\]]*]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/【[^】]*】/g, ' ')
    .replace(/（[^）]*）/g, ' ')
    .replace(/\{[^}]*}/g, ' ')
    .replace(/(?:\s*[-–—|]\s*).*$/g, ' ');

  sanitized = sanitized
    .replace(/\b(?:cover|커버|original|오리지널)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (sanitized.length === 0) {
    const fallbackTitle = (tagTitle || (typeof title === 'string' ? title : '') || fallback).trim();
    return fallbackTitle || '제목 없음';
  }

  return sanitized;
};

const categorizeClip = (
  clip: ClipResponse,
  parentVideo?: VideoResponse | null
): VideoCategoryKey | null => {
  if (parentVideo) {
    return categorizeVideo(parentVideo);
  }

  const normalizedTags = Array.isArray(clip.tags)
    ? clip.tags
        .map((tag) => (typeof tag === 'string' ? tag.trim().toLowerCase() : ''))
        .filter(Boolean)
    : [];

  if (normalizedTags.some((tag) => matchCategoryKeyword(tag, 'live'))) {
    return 'live';
  }
  if (normalizedTags.some((tag) => matchCategoryKeyword(tag, 'cover'))) {
    return 'cover';
  }
  if (normalizedTags.some((tag) => matchCategoryKeyword(tag, 'original'))) {
    return 'original';
  }

  return null;
};

const buildTagList = (...sources: Array<string | null | undefined | string[]>): string[] => {
  const values: string[] = [];
  const append = (tag: string | null | undefined) => {
    const normalized = typeof tag === 'string' ? tag.trim() : '';
    if (!normalized || values.includes(normalized)) {
      return;
    }
    values.push(normalized);
  };

  sources.forEach((source) => {
    if (!source) {
      return;
    }
    if (Array.isArray(source)) {
      source.forEach(append);
    } else {
      append(source);
    }
  });

  return values;
};

const formatVideoMetaSummary = (
  video: VideoResponse,
  options: { includeDuration?: boolean; includeContentType?: boolean } = {}
): string => {
  const parts: string[] = [];
  const categoryLabel = describeVideoCategory(categorizeVideo(video));
  if (categoryLabel) {
    parts.push(categoryLabel);
  }
  if (options.includeContentType !== false) {
    parts.push(describeVideoContentType(video.contentType));
  }
  if (options.includeDuration !== false) {
    const durationSec = parseDurationSeconds(video.durationSec);
    parts.push(formatSeconds(durationSec ?? 0));
  }
  const uniqueParts = parts.filter((part, index) => parts.indexOf(part) === index);
  return uniqueParts.join(' · ');
};

function parseDurationSeconds(
  value: VideoResponse['durationSec'] | null | undefined
): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

type ArtistCountryKey = 'availableKo' | 'availableEn' | 'availableJp';

const parseTags = (value: string | string[]): string[] => {
  if (Array.isArray(value)) {
    return value.map((tag) => tag.trim()).filter(Boolean);
  }
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
};

const normalizeTagValue = (tag: string): string => tag.replace(/\s+/g, ' ').trim();

const normalizeChannelId = (value: string | null | undefined): string =>
  (value ?? '').trim().toLowerCase();

const extractAxiosErrorMessage = (error: unknown, fallback: string): string => {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    if (typeof data === 'string' && data.trim()) {
      return data.trim();
    }
    if (data && typeof data === 'object') {
      const { message, error: errorField } = data as {
        message?: string;
        error?: string;
      };
      const detail = message ?? errorField;
      if (typeof detail === 'string' && detail.trim()) {
        return detail.trim();
      }
    }
  }
  return fallback;
};

const ARTIST_COUNTRY_METADATA: ReadonlyArray<{
  key: ArtistCountryKey;
  code: string;
  label: string;
}> = [
  { key: 'availableKo', code: 'KR', label: 'KR' },
  { key: 'availableJp', code: 'JP', label: 'JP' },
  { key: 'availableEn', code: 'EN', label: 'EN' }
];

const ARTIST_FORM_COUNTRIES: ReadonlyArray<{
  key: keyof ArtistFormState['countries'];
  code: string;
  label: string;
}> = [
  { key: 'ko', code: 'KR', label: 'KR' },
  { key: 'jp', code: 'JP', label: 'JP' },
  { key: 'en', code: 'EN', label: 'EN' }
];

const AUTH_TOKEN_STORAGE_KEY = 'yt-clip.auth-token';
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;

type PreparedArtist = ArtistResponse & {
  searchableFields: string[];
  normalizedTags: string[];
  normalizedAgency: string | null;
  cardData: ArtistLibraryCardData;
};

const prepareArtist = (artist: ArtistResponse): PreparedArtist => {
  const searchableFields = [
    artist.name,
    artist.displayName,
    artist.youtubeChannelId,
    artist.youtubeChannelTitle ?? undefined,
    typeof artist.agency === 'string' ? artist.agency : undefined
  ]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value): value is string => value.length > 0)
    .map((value) => value.toLowerCase());

  const normalizedTags = Array.isArray(artist.tags)
    ? artist.tags
        .map((tag) => (typeof tag === 'string' ? tag.trim().toLowerCase() : ''))
        .filter((tag): tag is string => tag.length > 0)
    : [];

  const normalizedAgency =
    typeof artist.agency === 'string' && artist.agency.trim().length > 0
      ? artist.agency.trim().toLowerCase()
      : null;

  const displayName = artist.displayName || artist.name;
  const fallbackAvatarUrl = `https://ui-avatars.com/api/?background=111827&color=e2e8f0&name=${encodeURIComponent(
    displayName
  )}`;
  const countryBadges = ARTIST_COUNTRY_METADATA.filter((country) => artist[country.key])
    .map((country) => ({ code: country.code, label: country.label }));
  const agency = typeof artist.agency === 'string' ? artist.agency.trim() : '';
  const tags = Array.isArray(artist.tags)
    ? Array.from(
        new Set(
          artist.tags
            .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
            .filter((tag): tag is string => tag.length > 0)
        )
      )
    : [];

  return {
    ...artist,
    searchableFields,
    normalizedTags,
    normalizedAgency,
    cardData: {
      fallbackAvatarUrl,
      countryBadges,
      agency,
      tags,
      displayName
    }
  };
};

const prepareArtists = (values: ArtistResponse[]): PreparedArtist[] => values.map(prepareArtist);

type PreparedLiveArtist = {
  artist: PreparedArtist;
  liveVideos: LiveBroadcastResponse[];
};

const normalizeLiveBroadcast = (video: LiveBroadcastResponse): LiveBroadcastResponse | null => {
  const videoId = typeof video.videoId === 'string' ? video.videoId.trim() : '';
  if (!videoId) {
    return null;
  }
  const title = typeof video.title === 'string' && video.title.trim().length > 0 ? video.title.trim() : null;
  const thumbnailUrl =
    typeof video.thumbnailUrl === 'string' && video.thumbnailUrl.trim().length > 0 ? video.thumbnailUrl.trim() : null;
  const url =
    typeof video.url === 'string' && video.url.trim().length > 0
      ? video.url.trim()
      : `https://www.youtube.com/watch?v=${videoId}`;
  const startedAt =
    typeof video.startedAt === 'string' && video.startedAt.trim().length > 0 ? video.startedAt.trim() : null;
  const scheduledStartAt =
    typeof video.scheduledStartAt === 'string' && video.scheduledStartAt.trim().length > 0
      ? video.scheduledStartAt.trim()
      : null;
  return {
    videoId,
    title,
    thumbnailUrl,
    url,
    startedAt,
    scheduledStartAt
  };
};

type ArtistProfileFormState = {
  agency: string;
  tags: string;
};

const formatArtistTagsForInput = (
  tags: ArtistResponse['tags'] | null | undefined
): string => {
  if (!Array.isArray(tags)) {
    return '';
  }
  const normalized = tags
    .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
    .filter((tag): tag is string => tag.length > 0);
  return Array.from(new Set(normalized)).join(', ');
};

const createArtistProfileFormState = (
  artist: ArtistResponse | null | undefined
): ArtistProfileFormState => ({
  agency: typeof artist?.agency === 'string' ? artist.agency : '',
  tags: formatArtistTagsForInput(artist?.tags)
});

interface ClipResponse {
  id: number;
  videoId: number;
  title: string;
  startSec: number;
  endSec: number;
  tags: string[];
  thumbnailUrl?: string | null;
  youtubeVideoId?: string;
  videoTitle?: string | null;
  sectionTitle?: string | null;
  youtubeChapterTitle?: string | null;
  description?: string | null;
  originalComposer?: string | null;
  videoOriginalComposer?: string | null;
  artistId?: number | null;
  primaryArtistId?: number | null;
  artistName?: string | null;
  artistDisplayName?: string | null;
  artistYoutubeChannelId?: string | null;
  artistYoutubeChannelTitle?: string | null;
  artistProfileImageUrl?: string | null;
  artists?: { id: number }[];
  hidden?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
}

type PlaylistEntry =
  | { type: 'video'; itemId: number; video: VideoResponse }
  | { type: 'clip'; itemId: number; clip: ClipResponse; parentVideo: VideoResponse | null };

type LatestClipEntry = {
  clip: ClipResponse;
  parentVideo: VideoResponse | null;
};

type PlaylistVisibility = 'PRIVATE' | 'UNLISTED' | 'PUBLIC';

type PlaylistItemType = 'video' | 'clip';

interface PlaylistItemResponse {
  id: number;
  playlistId: number;
  ordering: number;
  createdAt: string;
  updatedAt: string;
  type: PlaylistItemType;
  video?: VideoResponse;
  clip?: ClipResponse;
}

interface PlaylistResponse {
  id: number;
  ownerId: number;
  title: string;
  visibility: PlaylistVisibility;
  createdAt: string;
  updatedAt: string;
  items: PlaylistItemResponse[];
}

interface ClipCandidateResponse {
  startSec: number;
  endSec: number;
  score: number;
  label: string;
}

type ClipEditStatus = {
  type: 'success' | 'error';
  message: string;
};

interface ClipListItemData {
  activeClipId: number | null;
  clipEditForm: ClipEditFormState;
  clipEditStatus: ClipEditStatus | null;
  selectedVideoData: VideoResponse | null;
  creationDisabled: boolean;
  isClipUpdateSaving: boolean;
  hasPlaybackPlayer: boolean;
  canModifyPlaylist: boolean;
  playlistClipItemMap: Map<number, PlaylistItemResponse>;
  handleClipPlaylistToggle: (clipId: number) => Promise<void>;
  getParentVideo: (clip: ClipResponse) => VideoResponse | null;
  addToQueue: (clip: ClipResponse) => void;
}

interface ClipPreviewData {
  clipId: number;
  clipTitle: string;
  videoTitle: string;
  youtubeVideoId: string;
  startSec: number;
  endSec: number;
  rangeLabel: string;
  tags: string[];
  isEditing: boolean;
}

interface VideoClipSuggestionsResponse {
  video: VideoResponse;
  candidates?: MaybeArray<ClipCandidateResponse>;
  created?: boolean;
  reused?: boolean;
  status?: 'created' | 'existing' | 'updated' | 'reused' | string;
  message?: string | null;
}

type ClipLike = Omit<ClipResponse, 'tags'> & { tags?: unknown };

type PlaylistItemLike = Omit<PlaylistItemResponse, 'type' | 'ordering' | 'video' | 'clip'> & {
  type?: string;
  ordering?: number | string;
  video?: VideoResponse;
  clip?: ClipLike;
};

type PlaylistLike = Omit<PlaylistResponse, 'items' | 'visibility'> & {
  visibility?: string;
  items?: MaybeArray<PlaylistItemLike>;
};

type LocalizedTextInput = {
  languageCode: string;
  value: string;
};

type ClipCreationPayload = {
  videoId: number;
  title: string;
  titles: LocalizedTextInput[];
  startSec: number;
  endSec: number;
  tags: string[];
  originalComposers?: LocalizedTextInput[];
};

type VideoMetadataUpdatePayload = {
  title?: string;
  originalComposer?: string;
};

type ArtistFormState = {
  name: string;
  channelId: string;
  chzzkChannelId: string;
  tags: string[];
  tagInput: string;
  agency: string;
  countries: {
    ko: boolean;
    en: boolean;
    jp: boolean;
  };
};

const createInitialArtistFormState = (): ArtistFormState => ({
  name: '',
  channelId: '',
  chzzkChannelId: '',
  tags: [],
  tagInput: '',
  agency: '',
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
    agency?: string;
    tags?: string[];
    countries?: {
      ko: boolean;
      en: boolean;
      jp: boolean;
    };
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

  const clipOriginalComposer =
    typeof clip.originalComposer === 'string' ? clip.originalComposer.trim() : '';
  const videoOriginalComposer =
    typeof clip.videoOriginalComposer === 'string' ? clip.videoOriginalComposer.trim() : '';

  return {
    ...clip,
    tags: normalizedTags,
    videoTitle: clip.videoTitle ?? null,
    originalComposer: clipOriginalComposer.length > 0 ? clipOriginalComposer : null,
    videoOriginalComposer: videoOriginalComposer.length > 0 ? videoOriginalComposer : null
  };
};

const normalizePlaylistItem = (item: PlaylistItemLike): PlaylistItemResponse => {
  const itemId = Number(item.id);
  const playlistId = Number(item.playlistId);
  const ordering =
    typeof item.ordering === 'number'
      ? item.ordering
      : Number.isFinite(Number(item.ordering))
        ? Number(item.ordering)
        : 0;
  const type: PlaylistItemType =
    item.type === 'clip' || item.type === 'video'
      ? item.type
      : item.clip
        ? 'clip'
        : 'video';

  return {
    id: Number.isFinite(itemId) ? itemId : item.id,
    playlistId: Number.isFinite(playlistId) ? playlistId : item.playlistId,
    ordering,
    createdAt: item.createdAt ?? '',
    updatedAt: item.updatedAt ?? '',
    type,
    video: item.video ? normalizeVideo(item.video) : undefined,
    clip: item.clip ? normalizeClip(item.clip) : undefined
  };
};

const normalizePlaylist = (playlist: PlaylistLike): PlaylistResponse => {
  const playlistId = Number(playlist.id);
  const ownerId = Number(playlist.ownerId);
  const visibilityRaw = typeof playlist.visibility === 'string' ? playlist.visibility.trim().toUpperCase() : '';
  const visibility: PlaylistVisibility =
    visibilityRaw === 'PUBLIC' || visibilityRaw === 'UNLISTED'
      ? (visibilityRaw as PlaylistVisibility)
      : 'PRIVATE';

  const items = ensureArray(playlist.items ?? []).map(normalizePlaylistItem);
  items.sort((a, b) => {
    if (a.ordering !== b.ordering) {
      return a.ordering - b.ordering;
    }
    return a.id - b.id;
  });

  return {
    id: Number.isFinite(playlistId) ? playlistId : playlist.id,
    ownerId: Number.isFinite(ownerId) ? ownerId : playlist.ownerId,
    title: playlist.title ?? '',
    visibility,
    createdAt: playlist.createdAt ?? '',
    updatedAt: playlist.updatedAt ?? '',
    items
  };
};

type SectionKey = 'library' | 'live' | 'latest' | 'catalog';

const SECTION_PATHS: Record<SectionKey, `/${string}`> = {
  latest: '/latest',
  live: '/live',
  library: '/library',
  catalog: '/catalog'
};

const resolveSectionFromPath = (pathname: string): SectionKey => {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  const [, firstSegment] = normalized.split('/');
  if (firstSegment === 'latest' || firstSegment === 'live' || firstSegment === 'library' || firstSegment === 'catalog') {
    return firstSegment;
  }
  return 'library';
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

interface UserResponse {
  id: number;
  email: string;
  displayName: string | null;
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

type PlaylistEntriesListProps = {
  entries: PlaylistEntry[];
  expandedPlaylistEntryId: string | null;
  handlePlaylistEntryRemove: (itemId: number) => Promise<void> | void;
  setExpandedPlaylistEntryId: (entryId: string | null) => void;
  resolvePlaylistEntryKey: (entry: PlaylistEntry, index: number) => string;
  isRemovalDisabled: boolean;
};

function PlaylistEntriesList({
  entries,
  expandedPlaylistEntryId,
  handlePlaylistEntryRemove,
  setExpandedPlaylistEntryId,
  resolvePlaylistEntryKey,
  isRemovalDisabled
}: PlaylistEntriesListProps) {
  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="playlist-entries">
      {entries.map((entry, index) => {
        const entryKey = resolvePlaylistEntryKey(entry, index);
        const isExpanded = expandedPlaylistEntryId === entryKey;

        if (entry.type === 'video') {
          const video = entry.video;
          const youtubeVideoId = (video.youtubeVideoId ?? '').trim();
          const hasPlayableVideo = youtubeVideoId.length > 0;
          const canPreviewVideo = hasPlayableVideo;
          const shouldRenderPlayer = isExpanded;
          const videoThumbnail =
            video.thumbnailUrl ||
            (hasPlayableVideo ? `https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg` : null);
          const rawVideoTitle = video.title || video.youtubeVideoId || '제목 없는 영상';
          const videoCategory = categorizeVideo(video);
          const videoTitle =
            videoCategory === 'live'
              ? rawVideoTitle
              : formatSongTitle(video.title, { fallback: rawVideoTitle });
          const videoArtist =
            video.artistDisplayName ||
            video.artistName ||
            video.artistYoutubeChannelTitle ||
            null;
          const playlistVideoOriginalComposer =
            typeof video.originalComposer === 'string' ? video.originalComposer.trim() : '';
          const videoArtistName = (video.artistDisplayName ?? video.artistName ?? '').trim();
          const playlistVideoTags = buildTagList(
            playlistVideoOriginalComposer ? `원곡:${playlistVideoOriginalComposer}` : null,
            videoCategory !== 'live' && videoArtistName ? `보컬:${videoArtistName}` : null
          );

          return (
            <div key={entryKey} className="playlist-entry playlist-entry--video">
              <div className="playlist-video-card">
                <div className="playlist-video-card__media">
                  <div className={`playlist-preview${shouldRenderPlayer ? ' playlist-preview--expanded' : ''}`}>
                    {shouldRenderPlayer && canPreviewVideo ? (
                      <>
                        <div className="playlist-preview__player">
                          <Suspense
                            fallback={
                              <div className="playlist-preview__loading" role="status" aria-live="polite">
                                플레이어 불러오는 중…
                              </div>
                            }
                          >
                            <ClipPlayer youtubeVideoId={youtubeVideoId} startSec={0} autoplay={false} />
                          </Suspense>
                        </div>
                        <div className="playlist-preview__actions">
                          <button
                            type="button"
                            className="playlist-preview-toggle playlist-preview-toggle--close"
                            onClick={() => setExpandedPlaylistEntryId(null)}
                          >
                            미리보기 닫기
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="playlist-preview-placeholder">
                        {videoThumbnail ? (
                          <img
                            className="playlist-preview-placeholder__image playlist-video-card__thumbnail"
                            src={videoThumbnail}
                            alt={`${videoTitle} 썸네일`}
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <div
                            className="playlist-preview-placeholder__fallback playlist-video-card__thumbnail playlist-video-card__thumbnail--placeholder"
                            aria-hidden="true"
                          >
                            <span>썸네일 없음</span>
                          </div>
                        )}
                        <div className="playlist-preview-placeholder__overlay">
                          <span className="playlist-preview-placeholder__label">
                            {formatSeconds(parseDurationSeconds(video.durationSec) ?? 0)}
                          </span>
                          {canPreviewVideo ? (
                            <button
                              type="button"
                              className="playlist-preview-toggle"
                              onClick={() => setExpandedPlaylistEntryId(entryKey)}
                            >
                              미리보기
                            </button>
                          ) : (
                            <span className="playlist-preview-placeholder__label playlist-preview-placeholder__label--muted">
                              재생할 수 있는 영상이 없습니다
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="playlist-video-card__meta">
                  <div className="playlist-entry__actions">
                    <button
                      type="button"
                      className="playlist-entry__action"
                      onClick={() => void handlePlaylistEntryRemove(entry.itemId)}
                      disabled={isRemovalDisabled}
                    >
                      재생목록에서 제거
                    </button>
                  </div>
                  <h3 className="playlist-video-card__title">{videoTitle}</h3>
                  <div className="playlist-video-card__details">
                    {videoArtist && <span className="playlist-video-card__artist">{videoArtist}</span>}
                    <span className="playlist-video-card__info">{formatVideoMetaSummary(video)}</span>
                  </div>
                  {playlistVideoTags.length > 0 && (
                    <div className="tag-row">
                      {playlistVideoTags.map((tag) => (
                        <span key={tag} className="tag">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        }

        const clip = entry.clip;
        const rawClipTitle =
          clip.title ||
          clip.sectionTitle ||
          clip.youtubeChapterTitle ||
          clip.description ||
          clip.youtubeVideoId ||
          clip.videoTitle ||
          '';
        const clipTitle =
          formatSongTitle(clip.title, { tags: clip.tags, fallback: rawClipTitle }) || '제목 없는 클립';

        return (
          <div key={entryKey} className="playlist-entry playlist-entry--clip">
            <div className="playlist-clip">
              <div className="playlist-clip__card">
                <div className="playlist-entry__actions">
                  <button
                    type="button"
                    className="playlist-entry__action"
                    onClick={() => void handlePlaylistEntryRemove(entry.itemId)}
                    disabled={isRemovalDisabled}
                  >
                    재생목록에서 제거
                  </button>
                </div>
                <div className="playlist-clip__meta">
                  <h4>{clipTitle}</h4>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function App() {
  const translate = useTranslations();
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<UserResponse | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(false);
  const [artists, setArtists] = useState<PreparedArtist[]>([]);
  const [liveArtists, setLiveArtists] = useState<PreparedLiveArtist[]>([]);
  const [isLiveArtistsLoading, setLiveArtistsLoading] = useState(false);
  const [liveArtistsError, setLiveArtistsError] = useState<string | null>(null);
  const [hasLoadedLiveArtists, setHasLoadedLiveArtists] = useState(false);
  const [videos, setVideos] = useState<VideoResponse[]>([]);
  const [publicVideos, setPublicVideos] = useState<VideoResponse[]>([]);
  const [songVideos, setSongVideos] = useState<VideoResponse[]>([]);
  const [publicSongVideos, setPublicSongVideos] = useState<VideoResponse[]>([]);
  const [hasLoadedSongs, setHasLoadedSongs] = useState(false);
  const [hasLoadedPublicSongs, setHasLoadedPublicSongs] = useState(false);
  const videosRef = useRef<VideoResponse[]>([]);
  const songVideosRef = useRef<VideoResponse[]>([]);
  useEffect(() => {
    videosRef.current = videos;
  }, [videos]);
  useEffect(() => {
    songVideosRef.current = songVideos;
  }, [songVideos]);
  const isAuthenticated = Boolean(authToken && currentUser);
  const [hiddenVideoIds, setHiddenVideoIds] = useState<number[]>([]);
  const hiddenVideoIdSet = useMemo(() => new Set(hiddenVideoIds), [hiddenVideoIds]);
  const [favoriteVideoIds, setFavoriteVideoIds] = useState<number[]>([]);
  const [userPlaylists, setUserPlaylists] = useState<PlaylistResponse[]>([]);
  const [publicPlaylists, setPublicPlaylists] = useState<PlaylistResponse[]>([]);
  const [activePlaylist, setActivePlaylist] = useState<PlaylistResponse | null>(null);
  const [expandedVideoCategories, setExpandedVideoCategories] = useState<Record<VideoCategoryKey, boolean>>({
    cover: false,
    live: false,
    original: false
  });
  const [clips, setClips] = useState<ClipResponse[]>([]);
  const [publicClips, setPublicClips] = useState<ClipResponse[]>([]);
  const [isClipsLoading, setClipsLoading] = useState(false);
  const [playlistSearchQuery, setPlaylistSearchQuery] = useState('');
  const [expandedPlaylistEntryId, setExpandedPlaylistEntryId] = useState<string | null>(null);
  const [isPlaybackExpanded, setIsPlaybackExpanded] = useState(false);
  const [isPlaybackActive, setIsPlaybackActive] = useState(false);
  const [playbackRepeatMode, setPlaybackRepeatMode] = useState<PlaybackRepeatMode>('off');
  const [activePlaybackKey, setActivePlaybackKey] = useState<string | null>(null);
  const [playbackActivationNonce, setPlaybackActivationNonce] = useState(0);
  const resolveIsMobileViewport = () =>
    typeof window !== 'undefined' ? window.innerWidth <= 768 : false;
  const [isMobileViewport, setIsMobileViewport] = useState(resolveIsMobileViewport);
  const [isMobileAuthOverlayOpen, setMobileAuthOverlayOpen] = useState(false);
  const [isFullPlayerOpen, setIsFullPlayerOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastTimeoutRef = useRef<Record<string, number>>({});
  const [isPlaylistDialogOpen, setPlaylistDialogOpen] = useState(false);
  const [playlistTitleInput, setPlaylistTitleInput] = useState('');
  const [playlistDialogVisibility, setPlaylistDialogVisibility] =
    useState<PlaylistVisibility>('PRIVATE');
  const playlistTitleResolverRef = useRef<((value: string | null) => void) | null>(null);
  const playlistDialogInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<number | null>(null);
  const [, setQueue] = useState<ClipResponse[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastMessageTimeoutRef = useRef<number | null>(null);
  const [clipCandidates, setClipCandidates] = useState<ClipCandidateResponse[]>([]);
  const libraryVideos = isAuthenticated ? videos : publicVideos;
  const librarySongVideos = isAuthenticated ? songVideos : publicSongVideos;
  const hasLoadedLibrarySongs = isAuthenticated ? hasLoadedSongs : hasLoadedPublicSongs;
  const libraryClips = isAuthenticated ? clips : publicClips;
  const dismissToast = useCallback((id: string) => {
    const timeoutId = toastTimeoutRef.current[id];
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      delete toastTimeoutRef.current[id];
    }
    setToasts((previous) => previous.filter((toast) => toast.id !== id));
  }, []);

  const enqueueToast = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      setToasts((previous) => [...previous, { id, message, tone }]);
      const timeoutId = window.setTimeout(() => dismissToast(id), 4200);
      toastTimeoutRef.current[id] = timeoutId;
    },
    [dismissToast]
  );

  const notifyError = useCallback(
    (message: string) => enqueueToast(message, 'error'),
    [enqueueToast]
  );

  useEffect(() => {
    return () => {
      Object.values(toastTimeoutRef.current).forEach((timeoutId) =>
        window.clearTimeout(timeoutId)
      );
      if (toastMessageTimeoutRef.current) {
        window.clearTimeout(toastMessageTimeoutRef.current);
      }
    };
  }, []);

  const showQueueToastMessage = useCallback((message: string) => {
    if (toastMessageTimeoutRef.current) {
      window.clearTimeout(toastMessageTimeoutRef.current);
    }
    setToastMessage(message);
    toastMessageTimeoutRef.current = window.setTimeout(() => setToastMessage(null), 2000);
  }, []);

  const addToQueue = useCallback(
    (clip: ClipResponse) => {
      setQueue((previous) => {
        const nextQueue = [...previous, clip];
        showQueueToastMessage(`'${clip.title}' 추가됨 (총 ${nextQueue.length}곡)`);
        return nextQueue;
      });
    },
    [showQueueToastMessage]
  );

  const resolvePlaylistTitle = useCallback((value: string | null) => {
    playlistTitleResolverRef.current?.(value);
    playlistTitleResolverRef.current = null;
    setPlaylistDialogOpen(false);
    setPlaylistTitleInput('');
  }, []);

  const requestPlaylistTitle = useCallback(
    (visibility: PlaylistVisibility): Promise<string | null> =>
      new Promise((resolve) => {
        playlistTitleResolverRef.current = resolve;
        setPlaylistTitleInput('');
        setPlaylistDialogVisibility(visibility);
        setPlaylistDialogOpen(true);
      }),
    []
  );

  const handlePlaylistDialogSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmedTitle = playlistTitleInput.trim();
      if (!trimmedTitle) {
        enqueueToast('재생목록 제목을 입력해 주세요.', 'error');
        return;
      }
      resolvePlaylistTitle(trimmedTitle);
    },
    [enqueueToast, playlistTitleInput, resolvePlaylistTitle]
  );

  const handlePlaylistDialogCancel = useCallback(() => {
    resolvePlaylistTitle(null);
  }, [resolvePlaylistTitle]);

  useEffect(() => {
    if (!isPlaylistDialogOpen) {
      return;
    }
    const handler = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handlePlaylistDialogCancel();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handlePlaylistDialogCancel, isPlaylistDialogOpen]);

  useEffect(() => {
    if (isPlaylistDialogOpen) {
      playlistDialogInputRef.current?.focus();
    }
  }, [isPlaylistDialogOpen]);
  const libraryVideoMap = useMemo(() => {
    const map = new Map<number, VideoResponse>();
    libraryVideos.forEach((video) => {
      map.set(video.id, video);
    });
    return map;
  }, [libraryVideos]);
  const latestVideos = useMemo(() => {
    const filtered = libraryVideos.filter(
      (video) => video.hidden !== true && !hiddenVideoIdSet.has(video.id)
    );
    const sorted = [...filtered].sort((a, b) => {
      const diff =
        resolveDescendingSortValue(b.createdAt ?? null, b.id) -
        resolveDescendingSortValue(a.createdAt ?? null, a.id);
      if (diff !== 0) {
        return diff;
      }
      return b.id - a.id;
    });
    return sorted.slice(0, LATEST_VIDEO_LIMIT);
  }, [libraryVideos, hiddenVideoIdSet]);
  const liveArtistEntries = useMemo(
    () => liveArtists.filter((entry) => entry.liveVideos.length > 0),
    [liveArtists]
  );
  const latestClipEntries = useMemo<LatestClipEntry[]>(() => {
    const filtered = libraryClips.filter((clip) => clip.hidden !== true);
    const sorted = [...filtered].sort((a, b) => {
      const diff =
        resolveDescendingSortValue(b.createdAt ?? null, b.id) -
        resolveDescendingSortValue(a.createdAt ?? null, a.id);
      if (diff !== 0) {
        return diff;
      }
      return b.id - a.id;
    });
    return sorted.slice(0, LATEST_CLIP_LIMIT).map((clip) => ({
      clip,
      parentVideo: libraryVideoMap.get(clip.videoId) ?? null
    }));
  }, [libraryClips, libraryVideoMap]);
  const [videoSubmissionStatus, setVideoSubmissionStatus] = useState<
    { type: 'success' | 'info' | 'error'; message: string }
  | null
  >(null);
  const autoDetectedSections = useMemo<VideoSectionResponse[]>(() => {
    if (clipCandidates.length === 0) {
      return [];
    }

    return clipCandidates.map((candidate, index) => {
      const trimmedLabel = (candidate.label ?? '').trim();
      return {
        title: trimmedLabel.length > 0 ? trimmedLabel : `자동 감지 제안 ${index + 1}`,
        startSec: candidate.startSec,
        endSec: candidate.endSec,
        source: AUTO_DETECTED_SECTION_SOURCE
      };
    });
  }, [clipCandidates]);
  const [activeLibraryView, setActiveLibraryView] = useState<ArtistLibraryView>('videoList');
  const isLibraryVideoFormOpen = activeLibraryView === 'videoForm';
  const isLibraryClipFormOpen = activeLibraryView === 'clipForm';
  const isLibraryMediaFormOpen = isLibraryVideoFormOpen || isLibraryClipFormOpen;
  const [artistForm, setArtistForm] = useState<ArtistFormState>(() => createInitialArtistFormState());
  const [artistSearch, setArtistSearch] = useState<{ query: string; mode: ArtistSearchMode }>({
    query: '',
    mode: 'all'
  });
  const [artistCountryFilter, setArtistCountryFilter] = useState<'all' | ArtistCountryKey>('all');
  const [artistAgencyFilter, setArtistAgencyFilter] = useState('all');
  const deferredArtistSearch = useDeferredValue(artistSearch);
  const [artistProfileForm, setArtistProfileForm] = useState<ArtistProfileFormState>(() =>
    createArtistProfileFormState(null)
  );
  const [artistProfileStatus, setArtistProfileStatus] = useState<
    { type: 'success' | 'error'; message: string }
  | null
  >(null);
  const artistProfileTags = useMemo(
    () => Array.from(new Set(parseTags(artistProfileForm.tags))),
    [artistProfileForm.tags]
  );
  const [isArtistProfileSaving, setArtistProfileSaving] = useState(false);
  const [videoForm, setVideoForm] = useState<VideoFormState>(() => createInitialVideoFormState());
  const [clipForm, setClipForm] = useState<ClipFormState>(() => createInitialClipFormState());
  const [clipEditForm, setClipEditForm] = useState<ClipEditFormState>(() => createInitialClipEditFormState());
  const clipEditStartFieldsEmpty =
    clipEditForm.startHours === '' &&
    clipEditForm.startMinutes === '' &&
    clipEditForm.startSeconds === '';
  const clipEditEndFieldsEmpty =
    clipEditForm.endHours === '' && clipEditForm.endMinutes === '' && clipEditForm.endSeconds === '';
  const clipEditStartCompactValue = clipEditStartFieldsEmpty
    ? ''
    : String(parseClipTimeParts(clipEditForm.startHours, clipEditForm.startMinutes, clipEditForm.startSeconds));
  const clipEditEndCompactValue = clipEditEndFieldsEmpty
    ? ''
    : String(parseClipTimeParts(clipEditForm.endHours, clipEditForm.endMinutes, clipEditForm.endSeconds));
  const playbackPlayerRef = useRef<YouTubePlayer | null>(null);
  const clipPreviewPlayerRef = useRef<YouTubePlayer | null>(null);
  const [hasPlaybackPlayer, setHasPlaybackPlayer] = useState(false);
  const [videoChannelResolution, setVideoChannelResolution] =
    useState<VideoChannelResolutionResponse | null>(null);
  const [videoChannelResolutionError, setVideoChannelResolutionError] = useState<string | null>(null);
  const [magicInputMessage, setMagicInputMessage] = useState<string | null>(null);
  const [isResolvingVideoChannel, setResolvingVideoChannel] = useState(false);
  const [isClipUpdateSaving, setClipUpdateSaving] = useState(false);
  const [clipEditStatus, setClipEditStatus] = useState<ClipEditStatus | null>(null);
  const [videoCategoryStatusMap, setVideoCategoryStatusMap] = useState<
    Record<number, VideoCategoryMutationStatus>
  >({});
  const [videoMetadataDraftMap, setVideoMetadataDraftMap] = useState<
    Record<number, VideoMetadataDraftState>
  >({});
  const [videoMetadataStatusMap, setVideoMetadataStatusMap] = useState<
    Record<number, VideoMetadataMutationStatus>
  >({});
  const autoDetectInFlightRef = useRef(false);
  const autoDetectedVideoIdRef = useRef<number | null>(null);
  const videoListSectionRef = useRef<HTMLElement | null>(null);
  const clipListSectionRef = useRef<HTMLElement | null>(null);
  const mobileAuthOverlayContentRef = useRef<HTMLDivElement | null>(null);
  const previousFocusedElementRef = useRef<HTMLElement | null>(null);
  const handleArtistSearchQueryChange = useCallback((value: string) => {
    setArtistSearch((previous) => {
      if (previous.query === value) {
        return previous;
      }
      return { ...previous, query: value };
    });
  }, [translate]);

  const handleArtistSearchModeChange = useCallback((mode: ArtistSearchMode) => {
    setArtistSearch((previous) => {
      if (previous.mode === mode) {
        return previous;
      }
      return { ...previous, mode };
    });
  }, []);

  const handleArtistSearchClear = useCallback(() => {
    setArtistSearch((previous) => {
      if (!previous.query) {
        return previous;
      }
      return { ...previous, query: '' };
    });
  }, []);

  const addArtistTags = useCallback((rawTags: string[]) => {
    setArtistForm((previous) => {
      const normalizedExisting = new Set(previous.tags.map((tag) => tag.toLowerCase()));
      const nextTags = [...previous.tags];

      rawTags.forEach((tag) => {
        const normalized = normalizeTagValue(tag);
        if (!normalized) {
          return;
        }
        const lowerCaseTag = normalized.toLowerCase();
        if (normalizedExisting.has(lowerCaseTag)) {
          return;
        }
        normalizedExisting.add(lowerCaseTag);
        nextTags.push(normalized);
      });

      return { ...previous, tags: nextTags };
    });
  }, []);

  const handleArtistTagInputChange = useCallback(
    (value: string) => {
      const segments = value.split(',');
      const trailingInput = segments.pop() ?? '';
      addArtistTags(segments);
      setArtistForm((previous) => ({ ...previous, tagInput: trailingInput }));
    },
    [addArtistTags]
  );

  const commitArtistTagInput = useCallback(() => {
    setArtistForm((previous) => {
      const normalized = normalizeTagValue(previous.tagInput);
      if (!normalized) {
        return previous.tagInput ? { ...previous, tagInput: '' } : previous;
      }
      if (previous.tags.some((tag) => tag.toLowerCase() === normalized.toLowerCase())) {
        return { ...previous, tagInput: '' };
      }
      return { ...previous, tags: [...previous.tags, normalized], tagInput: '' };
    });
  }, []);

  const handleArtistTagKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitArtistTagInput();
        return;
      }
      if (event.key === ',' && artistForm.tagInput.trim()) {
        event.preventDefault();
        handleArtistTagInputChange(`${artistForm.tagInput},`);
        return;
      }
      if (event.key === 'Backspace' && !artistForm.tagInput && artistForm.tags.length > 0) {
        event.preventDefault();
        setArtistForm((previous) => ({ ...previous, tags: previous.tags.slice(0, -1) }));
      }
    },
    [artistForm.tagInput, artistForm.tags.length, commitArtistTagInput, handleArtistTagInputChange]
  );

  const handleArtistTagRemove = useCallback((tag: string) => {
    setArtistForm((previous) => ({
      ...previous,
      tags: previous.tags.filter((existing) => existing !== tag)
    }));
  }, []);

  const addClipTags = useCallback((rawTags: string[]) => {
    setClipForm((previous) => {
      const existingTags = parseTags(previous.tags);
      const normalizedExisting = new Set(existingTags.map((tag) => tag.toLowerCase()));
      const nextTags = [...existingTags];

      rawTags.forEach((tag) => {
        const normalized = normalizeTagValue(tag);
        if (!normalized) {
          return;
        }
        const lowerCaseTag = normalized.toLowerCase();
        if (normalizedExisting.has(lowerCaseTag)) {
          return;
        }
        normalizedExisting.add(lowerCaseTag);
        nextTags.push(normalized);
      });

      return { ...previous, tags: nextTags.join(', ') };
    });
  }, []);

  const handleClipTagInputChange = useCallback(
    (value: string) => {
      const segments = value.split(',');
      const trailingInput = segments.pop() ?? '';
      addClipTags(segments);
      setClipForm((previous) => ({ ...previous, tagInput: trailingInput }));
    },
    [addClipTags]
  );

  const commitClipTagInput = useCallback(() => {
    setClipForm((previous) => {
      const normalized = normalizeTagValue(previous.tagInput);
      if (!normalized) {
        return previous.tagInput ? { ...previous, tagInput: '' } : previous;
      }
      const existing = parseTags(previous.tags);
      if (existing.some((tag) => tag.toLowerCase() === normalized.toLowerCase())) {
        return { ...previous, tagInput: '' };
      }
      const nextTags = [...existing, normalized];
      return { ...previous, tags: nextTags.join(', '), tagInput: '' };
    });
  }, []);

  const handleClipTagKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitClipTagInput();
        return;
      }
      if (event.key === ',' && clipForm.tagInput.trim()) {
        event.preventDefault();
        handleClipTagInputChange(`${clipForm.tagInput},`);
        return;
      }
      if (event.key === 'Backspace' && !clipForm.tagInput && parseTags(clipForm.tags).length > 0) {
        event.preventDefault();
        setClipForm((previous) => {
          const existing = parseTags(previous.tags);
          return { ...previous, tags: existing.slice(0, -1).join(', ') };
        });
      }
    },
    [clipForm.tagInput, clipForm.tags, commitClipTagInput, handleClipTagInputChange]
  );

  const handleClipTagRemove = useCallback((tag: string) => {
    setClipForm((previous) => ({
      ...previous,
      tags: parseTags(previous.tags).filter((existing) => existing !== tag).join(', ')
    }));
  }, []);

  useEffect(() => {
    if (!isMobileViewport && isMobileAuthOverlayOpen) {
      setMobileAuthOverlayOpen(false);
    }
  }, [isMobileViewport, isMobileAuthOverlayOpen]);

  useEffect(() => {
    if (!isMobileAuthOverlayOpen) {
      const previouslyFocused = previousFocusedElementRef.current;
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus({ preventScroll: true });
      }
      previousFocusedElementRef.current = null;
      return;
    }

    if (typeof document === 'undefined') {
      return;
    }

    const contentNode = mobileAuthOverlayContentRef.current;
    if (!contentNode) {
      return;
    }

    const selectors = [
      'a[href]',
      'button:not([disabled])',
      'textarea:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      '[tabindex]:not([tabindex="-1"])'
    ].join(', ');

    const getFocusableElements = () =>
      Array.from(contentNode.querySelectorAll<HTMLElement>(selectors)).filter(
        (element) => !element.hasAttribute('aria-hidden')
      );

    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) {
      previousFocusedElementRef.current = activeElement;
    } else {
      previousFocusedElementRef.current = null;
    }

    const focusFirstElement = () => {
      const focusableElements = getFocusableElements();
      const firstElement = focusableElements[0] ?? contentNode;
      firstElement.focus({ preventScroll: true });
    };

    const keydownHandler = (event: globalThis.KeyboardEvent) => {
      if (!isMobileAuthOverlayOpen) {
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        setMobileAuthOverlayOpen(false);
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) {
        event.preventDefault();
        contentNode.focus({ preventScroll: true });
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const currentActive = document.activeElement as HTMLElement | null;

      if (!event.shiftKey && currentActive === lastElement) {
        event.preventDefault();
        firstElement.focus({ preventScroll: true });
        return;
      }

      if (event.shiftKey && currentActive === firstElement) {
        event.preventDefault();
        lastElement.focus({ preventScroll: true });
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimeout = window.setTimeout(focusFirstElement, 0);
    document.addEventListener('keydown', keydownHandler);

    return () => {
      document.removeEventListener('keydown', keydownHandler);
      window.clearTimeout(focusTimeout);
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobileAuthOverlayOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleResize = () => setIsMobileViewport(resolveIsMobileViewport());
    handleResize();

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!isMobileViewport) {
      setIsFullPlayerOpen(false);
    }
  }, [isFullPlayerOpen, isMobileViewport]);

  const scrollToSection = useCallback((sectionRef: RefObject<HTMLElement | null>) => {
    sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);
  const scrollToSectionWithFrame = useCallback(
    (sectionRef: RefObject<HTMLElement | null>) => {
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => scrollToSection(sectionRef));
        return;
      }
      scrollToSection(sectionRef);
    },
    [scrollToSection]
  );
  const handleClipTimePartChange = useCallback(
    (key: ClipTimeField) => (event: ChangeEvent<HTMLInputElement>) => {
      const options = key.endsWith('Hours')
        ? { maxLength: 3, maxValue: null }
        : key.endsWith('Seconds')
          ? { maxLength: null, maxValue: 59.9, allowDecimal: true }
          : { maxLength: 2, maxValue: 59 };
      const sanitized = sanitizeTimePartInput(event.target.value, options);
      setClipForm((prev) => ({ ...prev, [key]: sanitized }));
    },
    []
  );
  const resetClipEditForm = useCallback(() => {
    setClipEditForm(createInitialClipEditFormState());
    setClipEditStatus(null);
    setClipUpdateSaving(false);
  }, []);
  const handleClipEditTimePartChange = useCallback(
    (key: ClipTimeField) => (event: ChangeEvent<HTMLInputElement>) => {
      const options = key.endsWith('Hours')
        ? { maxLength: 3, maxValue: null }
        : key.endsWith('Seconds')
          ? { maxLength: null, maxValue: 59.9, allowDecimal: true }
          : { maxLength: 2, maxValue: 59 };
      const sanitized = sanitizeTimePartInput(event.target.value, options);
      setClipEditForm((prev) => ({ ...prev, [key]: sanitized }));
      setClipEditStatus(null);
    },
    []
  );
  const handlePlaybackPlayerChange = useCallback((player: YouTubePlayer | null) => {
    playbackPlayerRef.current = player;
    setHasPlaybackPlayer(Boolean(player));
  }, []);
  const handleClipPreviewPlayerChange = useCallback((player: YouTubePlayer | null) => {
    clipPreviewPlayerRef.current = player;
  }, []);
  const previewClipPosition = useCallback((seconds: number) => {
    const player = clipPreviewPlayerRef.current;
    if (!player || typeof player.seekTo !== 'function') {
      return;
    }
    try {
      player.seekTo(Math.max(0, seconds), true);
      if (typeof player.playVideo === 'function') {
        player.playVideo();
      }
    } catch {
      // Ignore preview playback errors
    }
  }, []);
  const getCurrentPlaybackSeconds = useCallback(() => {
    const player = playbackPlayerRef.current;
    if (!player || typeof player.getCurrentTime !== 'function') {
      return null;
    }
    try {
      const position = player.getCurrentTime();
      if (!Number.isFinite(position)) {
        return null;
      }
      return Math.max(0, Math.floor(position));
    } catch {
      return null;
    }
  }, []);
  const mediaRegistrationType = useMemo(
    () => resolveMediaRegistrationType(videoForm.url, selectedVideo),
    [videoForm.url, selectedVideo]
  );
  const isClipRegistration = mediaRegistrationType === 'clip';
  const clipFieldsRequired = isClipRegistration;
  const showClipFields = isClipRegistration;
  const [autoDetectMode, setAutoDetectMode] = useState('chapters');
  const [isArtistVideosLoading, setArtistVideosLoading] = useState(false);
  const [isGoogleReady, setIsGoogleReady] = useState(false);
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
  const [isArtistOptionalFieldsOpen, setArtistOptionalFieldsOpen] = useState(false);
  const [isMobileArtistPreviewOpen, setMobileArtistPreviewOpen] = useState(false);
  const [isMobileArtistDebugOpen, setMobileArtistDebugOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const activeSection = useMemo(
    () => resolveSectionFromPath(location.pathname),
    [location.pathname]
  );
  const navigateToSection = useCallback(
    (section: SectionKey) => {
      const targetPath = SECTION_PATHS[section];
      if (location.pathname !== targetPath) {
        navigate(targetPath);
      }
    },
    [location.pathname, navigate]
  );
  const [activeClipId, setActiveClipId] = useState<number | null>(null);
  const [latestPlaybackNotice, setLatestPlaybackNotice] = useState<string | null>(null);
  const [latestVideoPreviewMessage, setLatestVideoPreviewMessage] = useState<string | null>(null);
  const [adHocPlaybackItems, setAdHocPlaybackItems] = useState<PlaylistBarItem[]>([]);

  const appendArtistDebugLog = useCallback((entry: Omit<ArtistDebugLogEntry, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setArtistDebugLog((prev) => [{ ...entry, id }, ...prev].slice(0, 50));
  }, []);

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

  useEffect(() => {
    if (!isMobileViewport) {
      return;
    }
    setArtistOptionalFieldsOpen(false);
    setMobileArtistPreviewOpen(false);
  }, [isMobileViewport]);

  useEffect(() => {
    if (!isMobileViewport) {
      return;
    }
    setMobileArtistDebugOpen(isArtistDebugVisible);
  }, [isArtistDebugVisible, isMobileViewport]);

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

  const artistAgencies = useMemo(() => {
    const agencies = new Map<string, string>();
    artists.forEach((artist) => {
      if (typeof artist.agency === 'string') {
        const trimmed = artist.agency.trim();
        if (!trimmed) {
          return;
        }
        const normalized = trimmed.toLowerCase();
        if (!agencies.has(normalized)) {
          agencies.set(normalized, trimmed);
        }
      }
    });
    return Array.from(agencies.values()).sort((a, b) => a.localeCompare(b));
  }, [artists]);

  useEffect(() => {
    if (artistAgencyFilter === 'all') {
      return;
    }
    const normalizedFilter = artistAgencyFilter.trim().toLowerCase();
    const hasAgency = artistAgencies.some(
      (agency) => agency.trim().toLowerCase() === normalizedFilter
    );
    if (!hasAgency) {
      setArtistAgencyFilter('all');
    }
  }, [artistAgencyFilter, artistAgencies]);

  const deferredArtistSearchQuery = deferredArtistSearch.query;
  const deferredArtistSearchMode = deferredArtistSearch.mode;

  const filteredArtists = useMemo((): PreparedArtist[] => {
    const searchQuery = deferredArtistSearchQuery.trim().toLowerCase();
    const normalizedAgencyFilter =
      artistAgencyFilter === 'all' ? null : artistAgencyFilter.trim().toLowerCase();

    if (!searchQuery && artistCountryFilter === 'all' && !normalizedAgencyFilter) {
      return artists;
    }

    return artists.filter((artist) => {
      const matchesQuery = (() => {
        if (!searchQuery) {
          return true;
        }

        if (deferredArtistSearchMode === 'name') {
          return artist.searchableFields.some((value) => value.includes(searchQuery));
        }

        if (deferredArtistSearchMode === 'tag') {
          return artist.normalizedTags.some((tag) => tag.includes(searchQuery));
        }

        return (
          artist.searchableFields.some((value) => value.includes(searchQuery)) ||
          artist.normalizedTags.some((tag) => tag.includes(searchQuery))
        );
      })();

      const matchesCountry = artistCountryFilter === 'all' || Boolean(artist[artistCountryFilter]);
      const matchesAgency = !normalizedAgencyFilter || artist.normalizedAgency === normalizedAgencyFilter;

      return matchesQuery && matchesCountry && matchesAgency;
    });
  }, [
    artists,
    artistCountryFilter,
    artistAgencyFilter,
    deferredArtistSearchMode,
    deferredArtistSearchQuery
  ]);

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
  const [nicknameInput, setNicknameInput] = useState('');
  const [nicknameStatus, setNicknameStatus] = useState<string | null>(null);
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [isArtistRegistrationOpen, setArtistRegistrationOpen] = useState(false);
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

  const isDevEnvironment = import.meta.env.MODE !== 'production';

  const fetchArtistVideos = useCallback(
    async (artistId: number, signal?: AbortSignal): Promise<VideoResponse[]> => {
      if (isDevEnvironment) {
        console.debug('[fetchArtistVideos] Request started', {
          artistId,
          hasAuthToken: Boolean(authHeaders.Authorization)
        });
      }

      try {
        const response = await http.get<VideoResponse[]>('/videos', {
          headers: authHeaders,
          params: { artistId },
          signal
        });
        const videos = ensureArray(response.data);

        if (isDevEnvironment) {
          console.info('[fetchArtistVideos] Response received', {
            artistId,
            status: response.status,
            videoCount: videos.length
          });
        }

        return videos.map(normalizeVideo);
      } catch (error: unknown) {
        if (isDevEnvironment) {
          if (axios.isAxiosError(error)) {
            console.error('[fetchArtistVideos] Request failed', {
              artistId,
              status: error.response?.status,
              statusText: error.response?.statusText,
              code: error.code,
              message: error.message
            });
          } else {
            const fallbackMessage =
              error instanceof Error ? error.message : String(error);
            console.error('[fetchArtistVideos] Request failed with unknown error', {
              artistId,
              message: fallbackMessage
            });
          }
        }
        throw error;
      }
    },
    [authHeaders, isDevEnvironment]
  );

  const compareVideos = useCallback((a: VideoResponse, b: VideoResponse): number => {
    const diff =
      resolveDescendingSortValue(b.createdAt ?? null, b.id) -
      resolveDescendingSortValue(a.createdAt ?? null, a.id);
    if (diff !== 0) {
      return diff;
    }
    return b.id - a.id;
  }, []);

  const shouldAutoPromptGoogle = !authToken && !isLoadingUser;
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
    setNicknameStatus(null);
    setNicknameError(null);
  }, []);

  const handleSignOut = useCallback(() => {
    setAuthToken(null);
    setCurrentUser(null);
    setIsLoadingUser(false);
    setArtists([]);
    setVideos([]);
    setHiddenVideoIds([]);
    setFavoriteVideoIds([]);
    setUserPlaylists([]);
    setPublicPlaylists([]);
    setActivePlaylist(null);
    setClips([]);
    setPlaylistSearchQuery('');
    setClipCandidates([]);
    setSelectedVideo(null);
    setVideoForm(createInitialVideoFormState());
    setClipForm(createInitialClipFormState());
    setNicknameInput('');
    setNicknameStatus(null);
    setNicknameError(null);
    setVideoCategoryStatusMap({});
  }, []);

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
      const prepared = prepareArtists(ensureArray(response.data));
      setArtists(prepared);
    } catch (error) {
      console.error('Failed to load artists', error);
      setArtists([]);
    }
  }, [authHeaders]);

  const fetchLiveArtists = useCallback(async () => {
    setLiveArtistsLoading(true);
    setLiveArtistsError(null);
    try {
      const response = await http.get<LiveArtistResponse[]>('/artists/live', {
        headers: authHeaders
      });
      const payload = ensureArray(response.data);
      const prepared = payload.map((entry) => {
        const preparedArtist = prepareArtist(entry.artist);
        const liveVideos = Array.isArray(entry.liveVideos)
          ? entry.liveVideos
              .map((video) => normalizeLiveBroadcast(video))
              .filter((video): video is LiveBroadcastResponse => video !== null)
          : [];
        return { artist: preparedArtist, liveVideos } satisfies PreparedLiveArtist;
      });
      prepared.sort((a, b) => {
        const resolveTime = (videos: LiveBroadcastResponse[]): string | null => {
          const first = videos[0];
          if (!first) {
            return null;
          }
          return first.startedAt ?? first.scheduledStartAt ?? null;
        };
        const aTime = resolveTime(a.liveVideos);
        const bTime = resolveTime(b.liveVideos);
        if (aTime && bTime) {
          return bTime.localeCompare(aTime);
        }
        if (aTime) {
          return -1;
        }
        if (bTime) {
          return 1;
        }
        return a.artist.id - b.artist.id;
      });
      setLiveArtists(prepared);
      setHasLoadedLiveArtists(true);
    } catch (error) {
      console.error('Failed to load live artists', error);
      setLiveArtists([]);
      setLiveArtistsError(extractAxiosErrorMessage(error, translate('live.panel.errorFallback')));
      setHasLoadedLiveArtists(true);
    } finally {
      setLiveArtistsLoading(false);
    }
  }, [authHeaders, translate]);

  const handleLiveArtistsRetry = useCallback(() => {
    if (!isAuthenticated) {
      return;
    }
    setHasLoadedLiveArtists(false);
    setLiveArtistsError(null);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    setClipsLoading(false);
  }, [isAuthenticated]);

  useEffect(() => {
    void fetchArtists();
  }, [isAuthenticated, fetchArtists]);

  useEffect(() => {
    if (!isAuthenticated) {
      setLiveArtists([]);
      setHasLoadedLiveArtists(false);
      setLiveArtistsError(null);
      setLiveArtistsLoading(false);
      return;
    }
    if (activeSection !== 'live') {
      return;
    }
    if (isLiveArtistsLoading) {
      return;
    }
    if (hasLoadedLiveArtists && !liveArtistsError) {
      return;
    }
    void fetchLiveArtists();
  }, [
    isAuthenticated,
    activeSection,
    hasLoadedLiveArtists,
    liveArtistsError,
    isLiveArtistsLoading,
    fetchLiveArtists
  ]);

  const handleArtistSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (creationDisabled) {
      console.warn('Authentication is required to create artists.');
      return;
    }
    const trimmedName = artistForm.name.trim();
    const trimmedChannelId = artistForm.channelId.trim();
    const trimmedChzzkChannelId = artistForm.chzzkChannelId.trim();
    const chzzkChannelId = trimmedChzzkChannelId.length > 0 ? trimmedChzzkChannelId : null;
    const trimmedAgency = artistForm.agency.trim();
    const parsedTags = parseTags([...artistForm.tags, artistForm.tagInput]);
    const { ko, en, jp } = artistForm.countries;
    const hasCountrySelection = ko || en || jp;
    setArtistPreviewError(null);
    if (!trimmedName || !trimmedChannelId) {
      return;
    }
    const requestContext = {
      channelId: trimmedChannelId,
      name: trimmedName,
      chzzkChannelId: chzzkChannelId ?? undefined,
      agency: trimmedAgency || undefined,
      tags: parsedTags,
      countries: { ko, en, jp }
    } as const;
    const candidateChannelIds = new Set<string>();
    candidateChannelIds.add(normalizeChannelId(trimmedChannelId));
    if (artistPreview && artistPreview.inputChannel === trimmedChannelId) {
      candidateChannelIds.add(normalizeChannelId(artistPreview.data.channelId));
      const debug = artistPreview.data.debug;
      if (debug) {
        candidateChannelIds.add(normalizeChannelId(debug.resolvedChannelId));
        candidateChannelIds.add(normalizeChannelId(debug.htmlChannelId));
      }
    }

    const duplicateArtist = artists.find((artist) =>
      candidateChannelIds.has(normalizeChannelId(artist.youtubeChannelId))
    );

    if (duplicateArtist) {
      const duplicateMessage = duplicateArtist.displayName
        ? `이미 등록된 유튜브 채널입니다: ${duplicateArtist.displayName}`
        : '이미 등록된 유튜브 채널입니다.';
      notifyError(duplicateMessage);
      setArtistPreview(null);
      setArtistPreviewReady(false);
      setArtistPreviewError(duplicateMessage);
      return;
    }

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
          availableJp: jp,
          tags: parsedTags,
          agency: trimmedAgency,
          chzzkChannelId
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
      let responseData: unknown = null;
      if (axios.isAxiosError(error)) {
        responseData = error.response?.data;
      }
      const message = extractAxiosErrorMessage(error, '아티스트 등록에 실패했습니다.');
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        notifyError(message);
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
      navigateToSection('library');
      setArtistRegistrationOpen(false);
      setActiveLibraryView('videoForm');
    },
    [
      navigateToSection,
      setArtistRegistrationOpen,
      setClipForm,
      setActiveLibraryView,
      setSelectedVideo,
      setVideoForm
    ]
  );

  const reloadArtistVideos = useCallback(
    createReloadArtistVideos({
      artistId: videoForm.artistId,
      fetchVideos: fetchArtistVideos,
      setVideos,
      setHiddenVideoIds,
      setSelectedVideo,
      setArtistVideosLoading,
      compareVideos,
      onError: (error: unknown) => console.error('Failed to load videos', error)
    }),
    [
      videoForm.artistId,
      fetchArtistVideos,
      setVideos,
      setHiddenVideoIds,
      setSelectedVideo,
      setArtistVideosLoading,
      compareVideos
    ]
  );

  const applyVideoUpdate = useCallback(
    (video: VideoResponse) => {
      const mergeResult = mergeVideoIntoCollections(
        { videos: videosRef.current, songVideos: songVideosRef.current },
        video
      );

      videosRef.current = mergeResult.videos;
      songVideosRef.current = mergeResult.songVideos;
      setVideos(mergeResult.videos);
      setSongVideos(mergeResult.songVideos);
      return mergeResult;
    },
    [setVideos, setSongVideos]
  );

  const applyVideoRegistrationResult = useCallback(
    (video: VideoResponse, candidates: MaybeArray<ClipCandidateResponse>) => {
      const normalizedCandidates = ensureArray(candidates);
      const mergeResult = applyVideoUpdate(video);

      setSelectedVideo(mergeResult.normalizedVideo.id);
      setClipCandidates(normalizedCandidates);
      autoDetectedVideoIdRef.current = mergeResult.normalizedVideo.id;
      return { existed: mergeResult.existed, candidates: normalizedCandidates };
    },
    [applyVideoUpdate, setSelectedVideo, setClipCandidates]
  );

  const requestVideoRegistration = useCallback(
    async ({
      artistId,
      videoUrl,
      originalComposer,
      category
    }: {
      artistId: number;
      videoUrl: string;
      originalComposer?: string | null;
      category?: VideoCategorySelection;
    }) => {
      const response = await http.post<VideoClipSuggestionsResponse>(
        '/videos/clip-suggestions',
        {
          artistId,
          videoUrl,
          originalComposer: originalComposer ?? null,
          category: category && category.length > 0 ? category : null
        },
        { headers: authHeaders }
      );

      const payload = response.data;
      if (!payload || !payload.video) {
        throw new Error('Invalid clip suggestion response');
      }

      const result = applyVideoRegistrationResult(payload.video, payload.candidates);
      const normalizedStatus = typeof payload.status === 'string' ? payload.status : undefined;
      const explicitCreated =
        typeof payload.created === 'boolean'
          ? payload.created
          : typeof payload.reused === 'boolean'
            ? !payload.reused
            : normalizedStatus === 'created'
              ? true
              : normalizedStatus === 'existing' || normalizedStatus === 'reused'
                ? false
                : !result.existed;

      return {
        video: payload.video,
        candidates: result.candidates,
        created: explicitCreated,
        status: normalizedStatus ?? (explicitCreated ? 'created' : 'existing'),
        message: typeof payload.message === 'string' && payload.message.trim() ? payload.message.trim() : null
      };
    },
    [authHeaders, http, applyVideoRegistrationResult]
  );

  const updateVideoCategory = useCallback(
    async (videoId: number, category: VideoCategorySelection) => {
      if (creationDisabled) {
        return;
      }

      setVideoCategoryStatusMap((prev) => ({
        ...prev,
        [videoId]: { state: 'saving' }
      }));

      try {
        const response = await http.patch<VideoResponse>(
          `/videos/${videoId}/category`,
          { category: category && category.length > 0 ? category : null },
          { headers: authHeaders }
        );

        applyVideoUpdate(response.data);

        setVideoCategoryStatusMap((prev) => ({
          ...prev,
          [videoId]: { state: 'success', message: '분류가 저장되었습니다.' }
        }));

        window.setTimeout(() => {
          setVideoCategoryStatusMap((prev) => {
            const current = prev[videoId];
            if (!current || current.state !== 'success') {
              return prev;
            }
            const next = { ...prev };
            delete next[videoId];
            return next;
          });
        }, 2400);
      } catch (error) {
        const message = extractAxiosErrorMessage(error, '영상 분류를 저장하지 못했습니다.');
        console.error('Failed to update video category', error);
        setVideoCategoryStatusMap((prev) => ({
          ...prev,
          [videoId]: { state: 'error', message }
        }));
      }
    },
    [creationDisabled, http, authHeaders, applyVideoUpdate]
  );

  const openVideoMetadataEditor = useCallback(
    (video: VideoResponse) => {
      setVideoMetadataDraftMap((prev) => ({
        ...prev,
        [video.id]: {
          title: typeof video.title === 'string' ? video.title : '',
          originalComposer: typeof video.originalComposer === 'string' ? video.originalComposer : ''
        }
      }));
      setVideoMetadataStatusMap((prev) => {
        if (!prev[video.id]) {
          return prev;
        }
        const next = { ...prev };
        delete next[video.id];
        return next;
      });
    },
    [setVideoMetadataDraftMap, setVideoMetadataStatusMap]
  );

  const closeVideoMetadataEditor = useCallback(
    (videoId: number) => {
      setVideoMetadataDraftMap((prev) => {
        if (!prev[videoId]) {
          return prev;
        }
        const next = { ...prev };
        delete next[videoId];
        return next;
      });
      setVideoMetadataStatusMap((prev) => {
        if (!prev[videoId]) {
          return prev;
        }
        const next = { ...prev };
        delete next[videoId];
        return next;
      });
    },
    [setVideoMetadataDraftMap, setVideoMetadataStatusMap]
  );

  const handleVideoMetadataFieldChange = useCallback(
    (videoId: number, field: keyof VideoMetadataDraftState) =>
      (event: ChangeEvent<HTMLInputElement>) => {
        const { value } = event.target;
        setVideoMetadataDraftMap((prev) => {
          const current = prev[videoId];
          if (!current || current[field] === value) {
            return prev;
          }
          return {
            ...prev,
            [videoId]: { ...current, [field]: value }
          };
        });
        setVideoMetadataStatusMap((prev) => {
          const current = prev[videoId];
          if (!current || current.state === 'saving') {
            return prev;
          }
          const next = { ...prev };
          delete next[videoId];
          return next;
        });
      },
    [setVideoMetadataDraftMap, setVideoMetadataStatusMap]
  );

  const handleVideoMetadataSubmit = useCallback(
    async (video: VideoResponse) => {
      const draft = videoMetadataDraftMap[video.id];
      if (!draft || creationDisabled) {
        return;
      }

      const trimmedTitle = draft.title.trim();
      const trimmedComposer = draft.originalComposer.trim();
      const previousTitle = (video.title ?? '').trim();
      const previousComposer = (video.originalComposer ?? '').trim();
      const titleChanged = trimmedTitle !== previousTitle;
      const composerChanged = trimmedComposer !== previousComposer;

      if (!titleChanged && !composerChanged) {
        setVideoMetadataStatusMap((prev) => ({
          ...prev,
          [video.id]: { state: 'info', message: '변경된 내용이 없습니다.' }
        }));
        return;
      }

      if (titleChanged && trimmedTitle.length === 0) {
        setVideoMetadataStatusMap((prev) => ({
          ...prev,
          [video.id]: { state: 'error', message: '제목을 입력해 주세요.' }
        }));
        return;
      }

      const payload: VideoMetadataUpdatePayload = {};
      if (titleChanged) {
        payload.title = trimmedTitle;
      }
      if (composerChanged) {
        payload.originalComposer = trimmedComposer;
      }

      setVideoMetadataStatusMap((prev) => ({
        ...prev,
        [video.id]: { state: 'saving' }
      }));

      try {
        const response = await http.patch<VideoResponse>(`/videos/${video.id}`, payload, {
          headers: authHeaders
        });

        const updatedVideo = response.data;
        applyVideoUpdate(updatedVideo);

        setVideoMetadataDraftMap((prev) => ({
          ...prev,
          [video.id]: {
            title: typeof updatedVideo.title === 'string' ? updatedVideo.title : '',
            originalComposer:
              typeof updatedVideo.originalComposer === 'string' ? updatedVideo.originalComposer : ''
          }
        }));

        setVideoMetadataStatusMap((prev) => ({
          ...prev,
          [video.id]: { state: 'success', message: '메타데이터가 저장되었습니다.' }
        }));

        window.setTimeout(() => {
          setVideoMetadataStatusMap((prev) => {
            const current = prev[video.id];
            if (!current || current.state !== 'success') {
              return prev;
            }
            const next = { ...prev };
            delete next[video.id];
            return next;
          });
        }, 2400);
      } catch (error) {
        const message = extractAxiosErrorMessage(error, '영상 메타데이터를 저장하지 못했습니다.');
        setVideoMetadataStatusMap((prev) => ({
          ...prev,
          [video.id]: { state: 'error', message }
        }));
      }
    },
    [
      videoMetadataDraftMap,
      creationDisabled,
      http,
      authHeaders,
      applyVideoUpdate,
      setVideoMetadataDraftMap,
      setVideoMetadataStatusMap
    ]
  );

  const createClip = useCallback(
    async (payload: ClipCreationPayload, options?: { hiddenSource?: boolean }) => {
      const response = await http.post<ClipResponse>('/clips', payload, { headers: authHeaders });
      const normalizedClip = normalizeClip(response.data);
      setClipForm(createInitialClipFormState());
      setVideoForm((prev) => ({ ...prev, url: '' }));
      setClipCandidates([]);
      if (options?.hiddenSource) {
        setHiddenVideoIds((prev) =>
          prev.includes(response.data.videoId) ? prev : [...prev, response.data.videoId]
        );
      }
      if (response.data.videoId !== selectedVideo) {
        setSelectedVideo(response.data.videoId);
      }
      setClips((prev) => {
        const others = prev.filter((clip) => clip.id !== normalizedClip.id);
        return [...others, normalizedClip];
      });
      reloadArtistVideos().catch((error) => console.error('Failed to refresh videos after clip creation', error));
      return normalizedClip;
    },
    [authHeaders, http, reloadArtistVideos, selectedVideo]
  );

  const applyVideoSectionToClip = useCallback(
    (section: VideoSectionResponse, fallbackTitle: string) => {
      const resolvedTitle = section.title || fallbackTitle;
      const startParts = createClipTimePartValues(section.startSec);
      const endParts = createClipTimePartValues(section.endSec);

      setClipForm((prev) => ({
        ...prev,
        title: resolvedTitle,
        startHours: startParts.hours,
        startMinutes: startParts.minutes,
        startSeconds: startParts.seconds,
        endHours: endParts.hours,
        endMinutes: endParts.minutes,
        endSeconds: endParts.seconds
      }));

      const normalizedSource = (section.source ?? '').toUpperCase();
      const isAutoCreatableSource =
        normalizedSource === 'COMMENT' || normalizedSource === AUTO_DETECTED_SECTION_SOURCE;
      const trimmedVideoUrl = clipForm.videoUrl.trim();
      const parsedArtistId = Number(videoForm.artistId);
      const hasSelectedVideo = selectedVideo !== null;
      const canCreateWithVideoUrl =
        trimmedVideoUrl.length > 0 && !Number.isNaN(parsedArtistId) && videoForm.artistId !== '';

      const shouldAutoCreate =
        !creationDisabled &&
        isAutoCreatableSource &&
        (hasSelectedVideo || canCreateWithVideoUrl);

      if (!shouldAutoCreate) {
        return;
      }

      const tags = parseTags(clipForm.tags);
      const normalizedClipOriginalComposer = clipForm.originalComposer.trim();

      const fallbackTitleTrimmed = fallbackTitle.trim();
      const normalizedTitle = (() => {
        const trimmedResolved = resolvedTitle.trim();
        if (trimmedResolved.length > 0) {
          return trimmedResolved;
        }
        if (fallbackTitleTrimmed.length > 0) {
          return fallbackTitleTrimmed;
        }
        return resolvedTitle || fallbackTitle;
      })();

      const titles: LocalizedTextInput[] = [
        { languageCode: 'und', value: normalizedTitle }
      ];
      const originalComposerEntries =
        normalizedClipOriginalComposer.length > 0
          ? [{ languageCode: 'und', value: normalizedClipOriginalComposer }]
          : undefined;

      let videoIdForCreation: number | null = null;
      let restoreVideoUrl: string | null = null;

      if (hasSelectedVideo) {
        videoIdForCreation = selectedVideo;
      } else if (canCreateWithVideoUrl) {
        restoreVideoUrl = trimmedVideoUrl;
      } else {
        return;
      }

      const previousTags = clipForm.tags;

      const creationOptions = restoreVideoUrl ? { hiddenSource: true } : undefined;

      const buildPayload = (videoId: number): ClipCreationPayload => ({
        videoId,
        title: normalizedTitle,
        titles,
        startSec: section.startSec,
        endSec: section.endSec,
        tags,
        ...(originalComposerEntries ? { originalComposers: originalComposerEntries } : {})
      });

      void (async () => {
        try {
          if (restoreVideoUrl) {
            try {
              const registration = await requestVideoRegistration({
                artistId: parsedArtistId,
                videoUrl: restoreVideoUrl,
                originalComposer:
                  normalizedClipOriginalComposer.length > 0
                    ? normalizedClipOriginalComposer
                    : null,
                category: videoForm.category
              });
              videoIdForCreation = registration.video.id;
              const candidateCount = registration.candidates.length;
              const infoMessage =
                registration.message ??
                (registration.created
                  ? candidateCount > 0
                    ? `영상이 등록되었습니다. ${candidateCount}개의 추천 구간을 찾았습니다.`
                    : '영상이 등록되었습니다. 추천 구간을 찾지 못했습니다.'
                  : candidateCount > 0
                  ? '이미 등록된 영상을 불러왔습니다. 추천 구간을 새로 불러왔습니다.'
                  : '이미 등록된 영상을 불러왔습니다. 추천 구간을 찾지 못했습니다.');
              setVideoSubmissionStatus({
                type: registration.created ? 'success' : 'info',
                message: infoMessage
              });
            } catch (error) {
              const message = extractAxiosErrorMessage(error, '영상 정보를 불러오지 못했습니다.');
              setVideoSubmissionStatus({ type: 'error', message });
              throw error;
            }
          }

          if (videoIdForCreation == null) {
            throw new Error('Video ID is required to create a clip.');
          }

          await createClip(buildPayload(videoIdForCreation), creationOptions);
        } catch (error) {
          if (axios.isAxiosError(error) && error.response?.status === 409) {
            const message = extractAxiosErrorMessage(error, '이미 동일한 구간의 클립이 존재합니다.');
            notifyError(message);
          }
          console.error('Failed to auto-create clip from comment section', error);
        } finally {
          if (restoreVideoUrl) {
            setVideoForm((prev) => ({ ...prev, url: restoreVideoUrl }));
            setClipForm((prev) => ({ ...prev, videoUrl: restoreVideoUrl, tags: previousTags }));
          } else if (previousTags) {
            setClipForm((prev) => ({ ...prev, tags: previousTags }));
          }
        }
      })();
    },
    [
      clipForm.tags,
      clipForm.videoUrl,
      createClip,
      creationDisabled,
      requestVideoRegistration,
      selectedVideo,
      videoForm.artistId
    ]
  );

  const handleClipCandidateApply = useCallback(
    (candidate: ClipCandidateResponse, index: number) => {
      const section: VideoSectionResponse = {
        title: candidate.label ?? '',
        startSec: candidate.startSec,
        endSec: candidate.endSec,
        source: AUTO_DETECTED_SECTION_SOURCE
      };
      applyVideoSectionToClip(section, candidate.label || `자동 감지 제안 ${index + 1}`);
    },
    [applyVideoSectionToClip]
  );

  const submitVideo = useCallback(async (): Promise<VideoResponse | null> => {
    if (creationDisabled) {
      console.warn('Authentication is required to register videos.');
      return null;
    }

    const trimmedUrl = videoForm.url.trim();
    if (!trimmedUrl) {
      setVideoSubmissionStatus({ type: 'error', message: '영상 링크를 입력해 주세요.' });
      return null;
    }

    const parsedArtistId = Number(videoForm.artistId);
    if (!videoForm.artistId || Number.isNaN(parsedArtistId)) {
      setVideoSubmissionStatus({ type: 'error', message: '영상을 등록할 아티스트를 선택해 주세요.' });
      return null;
    }

    const normalizedVideoOriginalComposer = videoForm.originalComposer.trim();

    try {
      const result = await requestVideoRegistration({
        artistId: parsedArtistId,
        videoUrl: trimmedUrl,
        originalComposer:
          normalizedVideoOriginalComposer.length > 0 ? normalizedVideoOriginalComposer : null,
        category: videoForm.category
      });
      const candidateCount = result.candidates.length;
      const defaultMessage =
        result.message ??
        (result.created
          ? candidateCount > 0
            ? `영상이 등록되었습니다. ${candidateCount}개의 추천 구간을 찾았습니다. 아래 자동 감지된 클립 제안에서 확인하세요.`
            : '영상이 등록되었습니다. 추천 구간을 찾지 못했습니다. 영상 목록에서 직접 구간을 추가해 주세요.'
          : candidateCount > 0
          ? '이미 등록된 영상을 불러왔습니다. 추천 구간을 새로 불러왔습니다. 아래 자동 감지된 클립 제안에서 확인하세요.'
          : '이미 등록된 영상을 불러왔습니다. 추천 구간을 찾지 못했습니다.');

      setVideoSubmissionStatus({ type: result.created ? 'success' : 'info', message: defaultMessage });
      setVideoForm((prev) => ({
        ...prev,
        url: '',
        description: '',
        captionsJson: '',
        originalComposer: '',
        category: ''
      }));
      setClipForm((prev) => ({ ...prev, videoUrl: '' }));
      reloadArtistVideos().catch((error) => console.error('Failed to refresh videos after save', error));
      return result.video;
    } catch (error) {
      const message = extractAxiosErrorMessage(error, '영상 등록에 실패했습니다.');
      setVideoSubmissionStatus({ type: 'error', message });
      console.error('Failed to register video', error);
      return null;
    }
  }, [
    creationDisabled,
    videoForm.url,
    videoForm.artistId,
    videoForm.originalComposer,
    videoForm.category,
    requestVideoRegistration,
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
    if (isAuthenticated) {
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    const loadPublicPlaylist = async () => {
      try {
        const response = await http.get<MaybeArray<PlaylistLike>>('/public/clips', {
          signal: controller.signal
        });
        if (cancelled) {
          return;
        }
        const playlists = ensureArray(response.data).map(normalizePlaylist);
        setPublicPlaylists(playlists);
        setActivePlaylist((previous) => {
          if (!previous) {
            return playlists[0] ?? null;
          }
          const matched = playlists.find((playlist) => playlist.id === previous.id);
          return matched ?? playlists[0] ?? null;
        });
        setPlaylistSearchQuery('');
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        console.error('Failed to load public playlists', error);
        if (!cancelled) {
          setPublicPlaylists([]);
          setActivePlaylist(null);
          setPlaylistSearchQuery('');
        }
      }
    };

    void loadPublicPlaylist();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [http, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      setUserPlaylists([]);
      setActivePlaylist(null);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    const loadUserPlaylists = async () => {
      try {
        const response = await http.get<MaybeArray<PlaylistLike>>('/playlists', {
          headers: authHeaders,
          signal: controller.signal
        });
        if (cancelled) {
          return;
        }
        const playlists = ensureArray(response.data).map(normalizePlaylist);
        setUserPlaylists(playlists);
        setActivePlaylist((previous) => {
          if (!previous) {
            return playlists[0] ?? null;
          }
          const matched = playlists.find((playlist) => playlist.id === previous.id);
          return matched ?? playlists[0] ?? null;
        });
        setPlaylistSearchQuery('');
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        console.error('Failed to load playlists', error);
        if (!cancelled) {
          setUserPlaylists([]);
          setActivePlaylist(null);
          setPlaylistSearchQuery('');
        }
      }
    };

    void loadUserPlaylists();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [authHeaders, http, isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    setHiddenVideoIds([]);
    setClipsLoading(true);

    const loadPublicLibrary = async () => {
      try {
        const response = await http.get<{
          videos?: MaybeArray<VideoResponse>;
          clips?: MaybeArray<ClipResponse>;
        }>('/public/library', {
          signal: controller.signal
        });
        if (cancelled) {
          return;
        }
        const fetchedVideos = ensureArray(response.data?.videos).map(normalizeVideo);
        const normalizedClips = ensureArray(response.data?.clips).map(normalizeClip);
        setPublicVideos(fetchedVideos);
        setPublicClips(normalizedClips);
        setSelectedVideo((previous) =>
          previous && fetchedVideos.some((video) => video.id === previous) ? previous : null
        );
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        console.error('Failed to load public media library', error);
        if (!cancelled) {
          setPublicVideos([]);
          setPublicSongVideos([]);
          setPublicClips([]);
          setSelectedVideo(null);
        }
      } finally {
        if (!cancelled) {
          setClipsLoading(false);
        }
      }
    };

    void loadPublicLibrary();

    return () => {
      cancelled = true;
      controller.abort();
      setClipsLoading(false);
    };
  }, [http, isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      setPublicSongVideos([]);
      setHasLoadedPublicSongs(false);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    setHasLoadedPublicSongs(false);

    const loadPublicSongs = async () => {
      try {
        const response = await http.get<{
          songVideos?: MaybeArray<VideoResponse>;
        }>(
          '/public/songs',
          {
            signal: controller.signal
          }
        );
        if (cancelled) {
          return;
        }
        const fetchedSongVideos = ensureArray(response.data?.songVideos).map(normalizeVideo);
        setPublicSongVideos(fetchedSongVideos);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        console.error('Failed to load public songs', error);
      } finally {
        if (!cancelled) {
          setHasLoadedPublicSongs(true);
        }
      }
    };

    void loadPublicSongs();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [http, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      setVideos([]);
      setSongVideos([]);
      setHasLoadedSongs(false);
      setClips([]);
      setHiddenVideoIds([]);
      setSelectedVideo(null);
      setClipsLoading(false);
      return;
    }

    setPublicVideos([]);
    setPublicSongVideos([]);
    setPublicClips([]);

    const controller = new AbortController();
    let cancelled = false;

    const loadMediaLibrary = async () => {
      setClipsLoading(true);
      try {
        const response = await http.get<{
          videos?: MaybeArray<VideoResponse>;
          clips?: MaybeArray<ClipResponse>;
        }>(
          '/library/media',
          {
            headers: authHeaders,
            signal: controller.signal
          }
        );
        if (cancelled) {
          return;
        }
        const fetchedVideos = ensureArray(response.data?.videos).map(normalizeVideo);
        const normalizedClips = ensureArray(response.data?.clips).map(normalizeClip);
        setVideos(fetchedVideos);
        setClips(normalizedClips);
        setHiddenVideoIds((previous) =>
          previous.filter((id) => fetchedVideos.some((video) => video.id === id))
        );
        setSelectedVideo((previous) =>
          previous && fetchedVideos.some((video) => video.id === previous) ? previous : null
        );
        if (!cancelled) {
          setClipsLoading(false);
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        console.error('Failed to load media library', error);
        if (!cancelled) {
          setVideos([]);
          setSongVideos([]);
          setHasLoadedSongs(false);
          setClips([]);
          setHiddenVideoIds([]);
          setSelectedVideo(null);
          setClipsLoading(false);
        }
      }
    };

    void loadMediaLibrary();

    return () => {
      cancelled = true;
      controller.abort();
      setClipsLoading(false);
    };
  }, [authHeaders, http, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      setHasLoadedSongs(false);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    setHasLoadedSongs(false);

    const loadSongs = async () => {
      try {
        const response = await http.get<{
          songVideos?: MaybeArray<VideoResponse>;
        }>(
          '/library/songs',
          {
            headers: authHeaders,
            signal: controller.signal
          }
        );
        if (cancelled) {
          return;
        }
        const fetchedSongVideos = ensureArray(response.data?.songVideos).map(normalizeVideo);
        setSongVideos(fetchedSongVideos);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        console.error('Failed to load songs', error);
      } finally {
        if (!cancelled) {
          setHasLoadedSongs(true);
        }
      }
    };

    void loadSongs();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [authHeaders, http, isAuthenticated]);

  const submitClip = useCallback(async (options?: { videoId?: number }) => {
    if (creationDisabled) {
      console.warn('Authentication is required to create clips.');
      return;
    }
    const trimmedVideoUrl = clipForm.videoUrl.trim();
    const trimmedTitle = clipForm.title.trim();
    const tags = parseTags(clipForm.tags);

    let resolvedVideoId = options?.videoId ?? selectedVideo ?? null;

    if (!trimmedVideoUrl && !resolvedVideoId) {
      console.warn('클립을 저장하려면 라이브 영상 URL을 입력하거나 기존 영상을 선택해 주세요.');
      return;
    }

    if (!trimmedTitle) {
      notifyError('클립 제목을 입력해 주세요.');
      return;
    }

    const startSec = parseClipTimeParts(
      clipForm.startHours,
      clipForm.startMinutes,
      clipForm.startSeconds
    );
    const endSec = parseClipTimeParts(clipForm.endHours, clipForm.endMinutes, clipForm.endSeconds);

    if (endSec <= startSec) {
      notifyError('클립 종료 시간은 시작 시간보다 커야 합니다.');
      return;
    }

    const normalizedClipOriginalComposer = clipForm.originalComposer.trim();

    if (trimmedVideoUrl) {
      const parsedArtistId = Number(videoForm.artistId);
      if (!videoForm.artistId || Number.isNaN(parsedArtistId)) {
        setVideoSubmissionStatus({ type: 'error', message: '클립 원본을 등록하려면 아티스트를 먼저 선택해 주세요.' });
        console.warn('라이브 영상 URL을 등록하려면 아티스트를 먼저 선택해야 합니다.');
        return;
      }
      try {
        const registration = await requestVideoRegistration({
          artistId: parsedArtistId,
          videoUrl: trimmedVideoUrl,
          originalComposer:
            normalizedClipOriginalComposer.length > 0 ? normalizedClipOriginalComposer : null,
          category: videoForm.category
        });
        resolvedVideoId = registration.video.id;
        const candidateCount = registration.candidates.length;
        const infoMessage =
          registration.message ??
          (registration.created
            ? candidateCount > 0
              ? `영상이 등록되었습니다. ${candidateCount}개의 추천 구간을 찾았습니다. 아래 자동 감지된 클립 제안에서 확인하세요.`
              : '영상이 등록되었습니다. 추천 구간을 찾지 못했습니다. 영상 목록에서 직접 구간을 추가해 주세요.'
            : candidateCount > 0
            ? '이미 등록된 영상을 불러왔습니다. 추천 구간을 새로 불러왔습니다. 아래 자동 감지된 클립 제안에서 확인하세요.'
            : '이미 등록된 영상을 불러왔습니다. 추천 구간을 찾지 못했습니다.');
        setVideoSubmissionStatus({ type: registration.created ? 'success' : 'info', message: infoMessage });
      } catch (error) {
        const message = extractAxiosErrorMessage(error, '영상 정보를 불러오지 못했습니다.');
        setVideoSubmissionStatus({ type: 'error', message });
        console.error('Failed to prepare clip source video', error);
        return;
      }
    }

    if (!resolvedVideoId) {
      console.warn('클립을 저장하려면 라이브 영상 URL을 입력하거나 기존 영상을 선택해 주세요.');
      return;
    }

    const titles: LocalizedTextInput[] = [
      { languageCode: 'und', value: trimmedTitle }
    ];
    const originalComposerEntries =
      normalizedClipOriginalComposer.length > 0
        ? [{ languageCode: 'und', value: normalizedClipOriginalComposer }]
        : undefined;

    const payload: ClipCreationPayload = {
      videoId: resolvedVideoId,
      title: trimmedTitle,
      titles,
      startSec,
      endSec,
      tags,
      ...(originalComposerEntries ? { originalComposers: originalComposerEntries } : {})
    };

    try {
      await createClip(payload);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        const message = extractAxiosErrorMessage(error, '이미 동일한 구간의 클립이 존재합니다.');
        notifyError(message);
      }
      console.error('Failed to create clip', error);
    }
  }, [
    creationDisabled,
    clipForm.videoUrl,
    clipForm.tags,
    clipForm.title,
    clipForm.startHours,
    clipForm.startMinutes,
    clipForm.startSeconds,
    clipForm.endHours,
    clipForm.endMinutes,
    clipForm.endSeconds,
    clipForm.originalComposer,
    selectedVideo,
    videoForm.artistId,
    videoForm.category,
    requestVideoRegistration,
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
      const trimmedValue = value.trim();
      setVideoForm((prev) => ({ ...prev, url: value }));
      setClipForm((prev) => ({ ...prev, videoUrl: value }));
      setVideoSubmissionStatus(null);
      setVideoChannelResolution(null);
      setVideoChannelResolutionError(null);
      setMagicInputMessage(null);
      if (trimmedValue.length > 0) {
        setSelectedVideo(null);
      }
    },
    [setClipForm, setSelectedVideo, setVideoForm]
  );
  const handleArtistClick = useCallback((artistId: number) => {
    setVideoForm((prev) => ({ ...prev, artistId: String(artistId) }));
    setSelectedVideo(null);
    setActiveClipId(null);
    setClipCandidates([]);
    setVideoSubmissionStatus(null);
  }, []);
  const handleVideoChannelResolve = useCallback(async () => {
    if (creationDisabled) {
      return;
    }
    const trimmedUrl = videoForm.url.trim();
    if (!trimmedUrl) {
      setVideoChannelResolutionError('YouTube URL을 입력해 주세요.');
      setVideoChannelResolution(null);
      return;
    }
    setResolvingVideoChannel(true);
    setVideoChannelResolution(null);
    setVideoChannelResolutionError(null);
    setVideoSubmissionStatus(null);
    try {
      const response = await http.post<VideoChannelResolutionResponse>(
        '/videos/resolve-channel',
        { videoUrl: trimmedUrl },
        { headers: authHeaders }
      );
      const payload = response.data;
      setVideoChannelResolution(payload);
      if (payload.artist) {
        handleArtistClick(payload.artist.id);
      } else {
        setVideoForm((prev) => ({ ...prev, artistId: '' }));
        setSelectedVideo(null);
        setClipCandidates([]);
        setActiveClipId(null);
        if (payload.channelId) {
          setArtistForm((prev) => ({ ...prev, channelId: payload.channelId ?? '' }));
          setArtistRegistrationOpen(true);
        }
      }
      setActiveLibraryView('videoForm');
    } catch (error) {
      const message = extractAxiosErrorMessage(error, '채널 정보를 확인하지 못했습니다.');
      setVideoChannelResolution(null);
      setVideoChannelResolutionError(message);
    } finally {
      setResolvingVideoChannel(false);
    }
  }, [
    creationDisabled,
    videoForm.url,
    http,
    authHeaders,
    handleArtistClick,
    setSelectedVideo,
    setClipCandidates,
    setActiveClipId,
    setVideoForm,
    setActiveLibraryView
  ]);
  const handleVideoChannelResolveSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void handleVideoChannelResolve();
    },
    [handleVideoChannelResolve]
  );

  const handleMagicInputSubmit = useCallback(
    async (event?: FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      const trimmedUrl = videoForm.url.trim();
      if (!trimmedUrl) {
        setVideoChannelResolutionError('YouTube 링크를 붙여넣어 주세요.');
        return;
      }

      handleMediaUrlChange(trimmedUrl);
      setMagicInputMessage(null);

      const videoId = extractYouTubeVideoId(trimmedUrl);
      if (videoId) {
        const existingVideo = libraryVideos.find((video) => video.youtubeVideoId === videoId);
        if (existingVideo) {
          setVideoForm((prev) => ({ ...prev, artistId: String(existingVideo.artistId) }));
          setSelectedVideo(existingVideo.id);
          setActiveClipId(null);
          setClipCandidates([]);
          setActiveLibraryView('clipList');
          setMagicInputMessage('등록된 영상으로 이동했어요. 클립을 추가해 보세요.');
          clipListSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
      }

      await handleVideoChannelResolve();
    },
    [
      clipListSectionRef,
      handleMediaUrlChange,
      handleVideoChannelResolve,
      libraryVideos,
      setClipCandidates,
      setSelectedVideo,
      videoForm.url
    ]
  );

  const runAutoDetect = useCallback(async () => {
    if (!selectedVideo) {
      return;
    }
    if (creationDisabled) {
      console.warn('Authentication is required to run auto-detection.');
      return;
    }
    if (autoDetectInFlightRef.current) {
      return;
    }
    autoDetectInFlightRef.current = true;
    autoDetectedVideoIdRef.current = selectedVideo;
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
    } finally {
      autoDetectInFlightRef.current = false;
    }
  }, [selectedVideo, creationDisabled, http, autoDetectMode, authHeaders]);

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


  const handleArtistClear = () => {
    setVideoForm((prev) => ({ ...prev, artistId: '' }));
    setSelectedVideo(null);
    setClipCandidates([]);
    setActiveLibraryView('videoList');
    setVideoSubmissionStatus(null);
    setVideoChannelResolution(null);
    setVideoChannelResolutionError(null);
  };

  const handleLibraryVideoSelect = (videoId: number) => {
    setSelectedVideo(videoId);
  };

  const playlistItems = useMemo(() => activePlaylist?.items ?? [], [activePlaylist]);

  const playlistVideoItemMap = useMemo(() => {
    const map = new Map<number, PlaylistItemResponse>();
    playlistItems.forEach((item) => {
      if (item.type === 'video' && item.video) {
        map.set(item.video.id, item);
      }
    });
    return map;
  }, [playlistItems]);

  const playlistClipItemMap = useMemo(() => {
    const map = new Map<number, PlaylistItemResponse>();
    playlistItems.forEach((item) => {
      if (item.type === 'clip' && item.clip) {
        map.set(item.clip.id, item);
      }
    });
    return map;
  }, [playlistItems]);

  const playlistVideoMap = useMemo(() => {
    const map = new Map<number, VideoResponse>();
    playlistItems.forEach((item) => {
      if (item.type === 'video' && item.video) {
        map.set(item.video.id, item.video);
      }
    });
    return map;
  }, [playlistItems]);

  const adHocItemIdRef = useRef(-1);

  const createPlaylistVideoBarItem = useCallback(
    ({
      video,
      itemId,
      key,
      titleOverride,
      artistOverride
    }: {
      video: VideoResponse;
      itemId: number;
      key: string;
      titleOverride?: string;
      artistOverride?: string;
    }): PlaylistBarItem => {
      const youtubeVideoId = (video.youtubeVideoId ?? '').trim();
      const hasYoutube = youtubeVideoId.length > 0;
      const artistLabel =
        artistOverride ||
        video.artistDisplayName ||
        video.artistName ||
        video.artistYoutubeChannelTitle ||
        null;
      const summary = formatVideoMetaSummary(video, { includeDuration: false });
      const subtitleParts = [artistLabel, summary].filter((part): part is string => Boolean(part));
      const durationSec = parseDurationSeconds(video.durationSec);
      const durationLabel = durationSec !== null ? formatSeconds(durationSec) : null;
      const title =
        titleOverride ||
        formatSongTitle(video.title, { fallback: video.youtubeVideoId || '제목 없는 영상' }) ||
        video.title ||
        video.youtubeVideoId ||
        '제목 없는 영상';

      return {
        itemId,
        key,
        type: 'video' as const,
        title,
        subtitle: subtitleParts.length > 0 ? subtitleParts.join(' · ') : null,
        thumbnailUrl: video.thumbnailUrl ?? null,
        youtubeVideoId: hasYoutube ? youtubeVideoId : null,
        startSec: 0,
        endSec: durationSec ?? undefined,
        durationLabel,
        isPlayable: hasYoutube,
        badgeLabel: '영상',
        rangeLabel: null
      } satisfies PlaylistBarItem;
    },
    [formatVideoMetaSummary]
  );

  const createPlaylistClipBarItem = useCallback(
    ({
      clip,
      parentVideo,
      itemId,
      key,
      titleOverride,
      artistOverride
    }: {
      clip: ClipResponse;
      parentVideo: VideoResponse | null;
      itemId: number;
      key: string;
      titleOverride?: string;
      artistOverride?: string;
    }): PlaylistBarItem => {
      const youtubeVideoId = (clip.youtubeVideoId || parentVideo?.youtubeVideoId || '').trim();
      const hasYoutube = youtubeVideoId.length > 0;
      const rawClipTitle =
        clip.title ||
        clip.sectionTitle ||
        clip.youtubeChapterTitle ||
        clip.videoTitle ||
        '제목 없는 클립';
      const clipTitle =
        titleOverride || formatSongTitle(clip.title, { tags: clip.tags, fallback: rawClipTitle }) || rawClipTitle;
      const artistLabel =
        artistOverride ||
        clip.artistDisplayName ||
        clip.artistName ||
        clip.artistYoutubeChannelTitle ||
        parentVideo?.artistDisplayName ||
        parentVideo?.artistName ||
        parentVideo?.artistYoutubeChannelTitle ||
        null;
      const parentTitle = clip.videoTitle || parentVideo?.title || null;
      const rangeLabel =
        Number.isFinite(clip.startSec) && Number.isFinite(clip.endSec)
          ? `${formatSeconds(clip.startSec)} – ${formatSeconds(clip.endSec)}`
          : null;
      const durationLabel =
        typeof clip.endSec === 'number' && typeof clip.startSec === 'number'
          ? formatSeconds(Math.max(clip.endSec - clip.startSec, 0))
          : null;
      const subtitleParts = [artistLabel, parentTitle].filter((part): part is string => Boolean(part));

      return {
        itemId,
        key,
        type: 'clip' as const,
        title: clipTitle,
        subtitle: subtitleParts.length > 0 ? subtitleParts.join(' · ') : null,
        thumbnailUrl: clip.thumbnailUrl ?? parentVideo?.thumbnailUrl ?? null,
        youtubeVideoId: hasYoutube ? youtubeVideoId : null,
        startSec: clip.startSec,
        endSec: clip.endSec,
        durationLabel,
        isPlayable: hasYoutube,
        badgeLabel: '클립',
        rangeLabel
      } satisfies PlaylistBarItem;
    },
    []
  );

  const availablePlaylists = useMemo<PlaylistResponse[]>(
    () => (isAuthenticated ? userPlaylists : publicPlaylists),
    [isAuthenticated, publicPlaylists, userPlaylists]
  );

  const handlePlaylistSelectionChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const { value } = event.target;

      if (value === '') {
        if (!activePlaylist) {
          return;
        }
        setActivePlaylist(null);
        setPlaylistSearchQuery('');
        setExpandedPlaylistEntryId(null);
        return;
      }

      const playlistId = Number.parseInt(value, 10);
      const matchedPlaylist = Number.isFinite(playlistId)
        ? availablePlaylists.find((playlist) => playlist.id === playlistId) ?? null
        : null;
      const resolvedPlaylist = matchedPlaylist ?? availablePlaylists[0] ?? null;

      if (!resolvedPlaylist && !activePlaylist) {
        return;
      }

      if (resolvedPlaylist?.id === activePlaylist?.id) {
        return;
      }

      setActivePlaylist(resolvedPlaylist);
      setPlaylistSearchQuery('');
      setExpandedPlaylistEntryId(null);
    },
    [
      activePlaylist,
      availablePlaylists,
      setActivePlaylist,
      setExpandedPlaylistEntryId,
      setPlaylistSearchQuery
    ]
  );

  const handleVideoFavoriteToggle = useCallback((videoId: number) => {
    setFavoriteVideoIds((prev) =>
      prev.includes(videoId) ? prev.filter((id) => id !== videoId) : [...prev, videoId]
    );
  }, []);

  const applyUserPlaylistUpdate = useCallback((playlist: PlaylistResponse) => {
    setUserPlaylists((previous) => {
      let found = false;
      const next = previous.map((existing) => {
        if (existing.id === playlist.id) {
          found = true;
          return playlist;
        }
        return existing;
      });
      if (!found) {
        return [playlist, ...next];
      }
      return next;
    });
    setActivePlaylist(playlist);
  }, []);

  const handleCreatePlaylist = useCallback(async (): Promise<PlaylistResponse | null> => {
    if (!isAuthenticated) {
      notifyError('재생목록을 사용하려면 로그인해 주세요.');
      return null;
    }

    const visibility = activePlaylist?.visibility ?? 'PRIVATE';
    const titleInput = await requestPlaylistTitle(visibility);

    if (titleInput === null) {
      return null;
    }

    const trimmedTitle = titleInput.trim();

    if (trimmedTitle.length === 0) {
      notifyError('재생목록 제목을 입력해 주세요.');
      return null;
    }

    try {
      const response = await http.post<PlaylistResponse>(
        '/playlists',
        { title: trimmedTitle, visibility },
        { headers: authHeaders }
      );
      const normalized = normalizePlaylist(response.data);
      applyUserPlaylistUpdate(normalized);
      enqueueToast('새 재생목록을 만들었어요.', 'success');
      return normalized;
    } catch (error) {
      const message = extractAxiosErrorMessage(error, '재생목록을 생성하지 못했습니다.');
      notifyError(message);
      console.error('Failed to create playlist', error);
      return null;
    }
  }, [
    activePlaylist,
    applyUserPlaylistUpdate,
    authHeaders,
    enqueueToast,
    http,
    isAuthenticated,
    notifyError,
    requestPlaylistTitle
  ]);

  const handlePlaylistEntryRemove = useCallback(
    async (itemId: number) => {
      if (!isAuthenticated || !activePlaylist) {
        return;
      }

      try {
        const response = await http.delete<PlaylistResponse>(
          `/playlists/${activePlaylist.id}/items/${itemId}`,
          { headers: authHeaders }
        );
        applyUserPlaylistUpdate(normalizePlaylist(response.data));
      } catch (error) {
        const message = extractAxiosErrorMessage(
          error,
          '재생목록에서 항목을 제거하지 못했습니다.'
        );
        notifyError(message);
        console.error('Failed to remove playlist item', error);
      }
    },
    [activePlaylist, applyUserPlaylistUpdate, authHeaders, http, isAuthenticated]
  );

  const handlePlaybackQueueRemove = useCallback(
    async (itemId: number) => {
      if (itemId < 0) {
        setAdHocPlaybackItems((previous) => previous.filter((item) => item.itemId !== itemId));
        return;
      }
      await handlePlaylistEntryRemove(itemId);
    },
    [handlePlaylistEntryRemove]
  );

  const handleVideoPlaylistToggle = useCallback(
    async (videoId: number) => {
      if (!isAuthenticated) {
        notifyError('재생목록을 사용하려면 로그인해 주세요.');
        return;
      }

      let targetPlaylist = activePlaylist;

      if (!targetPlaylist) {
        const createdPlaylist = await handleCreatePlaylist();
        if (!createdPlaylist) {
          return;
        }
        targetPlaylist = createdPlaylist;
      }

      const playlistId = targetPlaylist.id;
      const existingItem =
        targetPlaylist.id === activePlaylist?.id ? playlistVideoItemMap.get(videoId) ?? null : null;

      try {
        if (existingItem) {
          const response = await http.delete<PlaylistResponse>(
            `/playlists/${playlistId}/items/${existingItem.id}`,
            { headers: authHeaders }
          );
          applyUserPlaylistUpdate(normalizePlaylist(response.data));
        } else {
          const response = await http.post<PlaylistResponse>(
            `/playlists/${playlistId}/items`,
            { videoId },
            { headers: authHeaders }
          );
          applyUserPlaylistUpdate(normalizePlaylist(response.data));
        }
      } catch (error) {
        const message = extractAxiosErrorMessage(error, '재생목록을 업데이트하지 못했습니다.');
        notifyError(message);
        console.error('Failed to update playlist', error);
      }
    },
    [
      activePlaylist,
      applyUserPlaylistUpdate,
      authHeaders,
      handleCreatePlaylist,
      http,
      isAuthenticated,
      playlistVideoItemMap
    ]
  );

  const handleClipPlaylistToggle = useCallback(
    async (clipId: number) => {
      if (!isAuthenticated) {
        notifyError('재생목록을 사용하려면 로그인해 주세요.');
        return;
      }

      let targetPlaylist = activePlaylist;

      if (!targetPlaylist) {
        const createdPlaylist = await handleCreatePlaylist();
        if (!createdPlaylist) {
          return;
        }
        targetPlaylist = createdPlaylist;
      }

      const playlistId = targetPlaylist.id;
      const existingItem =
        targetPlaylist.id === activePlaylist?.id ? playlistClipItemMap.get(clipId) ?? null : null;

      try {
        if (existingItem) {
          const response = await http.delete<PlaylistResponse>(
            `/playlists/${playlistId}/items/${existingItem.id}`,
            { headers: authHeaders }
          );
          applyUserPlaylistUpdate(normalizePlaylist(response.data));
        } else {
          const response = await http.post<PlaylistResponse>(
            `/playlists/${playlistId}/items`,
            { clipId },
            { headers: authHeaders }
          );
          applyUserPlaylistUpdate(normalizePlaylist(response.data));
        }
      } catch (error) {
        const message = extractAxiosErrorMessage(error, '재생목록을 업데이트하지 못했습니다.');
        notifyError(message);
        console.error('Failed to update playlist', error);
      }
    },
    [
      activePlaylist,
      applyUserPlaylistUpdate,
      authHeaders,
      handleCreatePlaylist,
      http,
      isAuthenticated,
      playlistClipItemMap
    ]
  );

  const handleVideoCardKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>, videoId: number) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleLibraryVideoSelect(videoId);
    }
  };

  const openArtistRegistration = useCallback(() => {
    navigateToSection('library');
    setArtistRegistrationOpen((prev) => !prev);
  }, [navigateToSection, setArtistRegistrationOpen]);

  const selectedArtist = artists.find((artist) => artist.id === Number(videoForm.artistId));
  const noArtistsRegistered = artists.length === 0;
  const noFilteredArtists = !noArtistsRegistered && filteredArtists.length === 0 && !selectedArtist;
  const artistList = filteredArtists;
  const selectedArtistId = selectedArtist?.id ?? null;
  const artistLibraryVideos = useMemo(() => {
    if (selectedArtistId === null) {
      return libraryVideos;
    }
    return libraryVideos.filter((video) => mediaMatchesArtist(video, selectedArtistId));
  }, [libraryVideos, selectedArtistId]);
  const artistLibraryVideoIdSet = useMemo(() => {
    if (selectedArtistId === null) {
      return null;
    }
    const ids = new Set<number>();
    libraryVideos.forEach((video) => {
      if (mediaMatchesArtist(video, selectedArtistId)) {
        ids.add(video.id);
      }
    });
    return ids;
  }, [libraryVideos, selectedArtistId]);
  const artistLibraryClips = useMemo(() => {
    if (selectedArtistId === null) {
      return libraryClips;
    }
    return libraryClips.filter((clip) => {
      if (mediaMatchesArtist(clip, selectedArtistId)) {
        return true;
      }
      return artistLibraryVideoIdSet?.has(clip.videoId) ?? false;
    });
  }, [artistLibraryVideoIdSet, libraryClips, selectedArtistId]);
  const artistLibrarySongVideos = useMemo(() => {
    return librarySongVideos;
  }, [librarySongVideos]);
  const isCatalogEmpty =
    artistLibraryClips.length === 0 &&
    hasLoadedLibrarySongs &&
    artistLibrarySongVideos.length === 0;

  useEffect(() => {
    setSelectedVideo((previous) => {
      if (previous !== null) {
        const matchingVideo = artistLibraryVideos.find((video) => video.id === previous);
        const hiddenSelectionIsValid =
          hiddenVideoIdSet.has(previous) &&
          (selectedArtistId === null ||
            libraryVideos.some(
              (video) => video.id === previous && video.artistId === selectedArtistId
            ));
        if (matchingVideo || hiddenSelectionIsValid) {
          return previous;
        }
      }
      const clipSource = artistLibraryVideos.find((video) => isClipSourceVideo(video));
      if (clipSource) {
        return clipSource.id;
      }
      return artistLibraryVideos.length > 0 ? artistLibraryVideos[0].id : null;
    });
  }, [artistLibraryVideos, hiddenVideoIdSet, libraryVideos, selectedArtistId]);

  useEffect(() => {
    setArtistProfileForm(createArtistProfileFormState(selectedArtist));
    setArtistProfileStatus(null);
  }, [selectedArtist]);

  useEffect(() => {
    setActiveLibraryView('videoList');
    setArtistRegistrationOpen(false);
  }, [selectedArtistId]);

  const handleLibraryVideoRegister = useCallback(() => {
    if (selectedArtistId) {
      setVideoForm((prev) => ({ ...prev, artistId: String(selectedArtistId) }));
    }
    setActiveLibraryView('videoForm');
    setVideoSubmissionStatus(null);
  }, [selectedArtistId]);

  const handleLibraryClipRegister = useCallback(() => {
    if (!selectedArtistId) {
      return;
    }
    setVideoForm((prev) => ({ ...prev, artistId: String(selectedArtistId) }));
    setActiveLibraryView('clipForm');
    setVideoSubmissionStatus(null);
  }, [selectedArtistId]);
  const latestPreviewRegionRef = useRef<HTMLDivElement | null>(null);
  const focusLatestPreviewRegion = useCallback(() => {
    window.requestAnimationFrame(() => {
      latestPreviewRegionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  const enqueueLatestPlaybackItem = useCallback(
    (item: PlaylistBarItem, noticeLabel: string) => {
      setAdHocPlaybackItems((previous) => {
        const filtered = previous.filter((queued) => queued.key !== item.key);
        return [...filtered, item];
      });
      setLatestPlaybackNotice(noticeLabel);
      setLatestVideoPreviewMessage(null);
      setPlaybackActivationNonce((previous) => previous + 1);
      setActivePlaybackKey(item.key);
      setIsPlaybackActive(true);
      setIsPlaybackExpanded(true);
      focusLatestPreviewRegion();
    },
    [focusLatestPreviewRegion, setIsPlaybackExpanded]
  );

  const handleLatestVideoPlay = useCallback(
    (video: VideoResponse, displayTitle: string, artistName: string) => {
      const youtubeVideoId = (video.youtubeVideoId ?? '').trim();
      if (youtubeVideoId) {
        const itemId = adHocItemIdRef.current--;
        const adHocItem = createPlaylistVideoBarItem({
          video,
          itemId,
          key: `adhoc-video-${video.id}-${Math.abs(itemId)}`,
          titleOverride: displayTitle,
          artistOverride: artistName
        });
        enqueueLatestPlaybackItem(adHocItem, `${displayTitle} · ${artistName}`);
        return;
      }
      setLatestPlaybackNotice(null);
      setLatestVideoPreviewMessage(translate('latest.panel.previewUnavailable'));
    },
    [createPlaylistVideoBarItem, enqueueLatestPlaybackItem, translate]
  );

  const handleLatestClipPlay = useCallback(
    (clip: ClipResponse, parentVideo: VideoResponse | null, clipTitle: string, artistName: string) => {
      const youtubeVideoId = (clip.youtubeVideoId || parentVideo?.youtubeVideoId || '').trim();
      if (youtubeVideoId) {
        const itemId = adHocItemIdRef.current--;
        const adHocItem = createPlaylistClipBarItem({
          clip,
          parentVideo: parentVideo ?? null,
          itemId,
          key: `adhoc-clip-${clip.id}-${Math.abs(itemId)}`,
          titleOverride: clipTitle,
          artistOverride: artistName
        });
        enqueueLatestPlaybackItem(adHocItem, `${clipTitle} · ${artistName}`);
        return;
      }
      setLatestPlaybackNotice(null);
      setLatestVideoPreviewMessage(translate('latest.panel.previewUnavailable'));
    },
    [createPlaylistClipBarItem, enqueueLatestPlaybackItem, translate]
  );
  const handleLatestPreviewDismiss = useCallback(() => {
    setLatestPlaybackNotice(null);
    setLatestVideoPreviewMessage(null);
  }, []);
  const handleShowVideoList = useCallback(() => {
    setActiveLibraryView('videoList');
    scrollToSectionWithFrame(videoListSectionRef);
  }, [setActiveLibraryView, scrollToSectionWithFrame]);
  const handleShowClipList = useCallback(() => {
    setActiveLibraryView('clipList');
    scrollToSectionWithFrame(clipListSectionRef);
  }, [setActiveLibraryView, scrollToSectionWithFrame]);
  const openVideoInLibrary = useCallback(
    (videoId: number) => {
      navigateToSection('library');
      setActiveLibraryView('videoList');
      handleLibraryVideoSelect(videoId);
      const video = libraryVideoMap.get(videoId);
      if (video) {
        const category = categorizeVideo(video);
        setExpandedVideoCategories((previous) => ({
          ...previous,
          [category]: true
        }));
      }
      scrollToSectionWithFrame(videoListSectionRef);
    },
    [
      handleLibraryVideoSelect,
      libraryVideoMap,
      scrollToSectionWithFrame,
      setActiveLibraryView,
      navigateToSection,
      setExpandedVideoCategories,
      videoListSectionRef
    ]
  );
  const openClipInLibrary = useCallback(
    (clipId: number) => {
      navigateToSection('library');
      setActiveLibraryView('clipList');
      setActiveClipId(clipId);
      resetClipEditForm();
    },
    [navigateToSection, resetClipEditForm, setActiveClipId, setActiveLibraryView]
  );
  const handleArtistProfileTagRemove = useCallback(
    (tag: string) => {
      const updatedTags = artistProfileTags.filter((existingTag) => existingTag !== tag);
      setArtistProfileForm((prev) => ({
        ...prev,
        tags: formatArtistTagsForInput(updatedTags)
      }));
      setArtistProfileStatus(null);
    },
    [artistProfileTags]
  );
  const handleArtistProfileReset = useCallback(() => {
    if (!selectedArtist) {
      setArtistProfileForm(createArtistProfileFormState(null));
      setArtistProfileStatus(null);
      return;
    }
    setArtistProfileForm(createArtistProfileFormState(selectedArtist));
    setArtistProfileStatus(null);
  }, [selectedArtist]);
  const handleArtistProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedArtistId || creationDisabled) {
      return;
    }
    const trimmedAgency = artistProfileForm.agency.trim();
    const parsedTags = parseTags(artistProfileForm.tags);
    setArtistProfileSaving(true);
    setArtistProfileStatus(null);
    try {
      const response = await http.put<ArtistResponse>(
        `/artists/${selectedArtistId}/profile`,
        {
          agency: trimmedAgency.length > 0 ? trimmedAgency : null,
          tags: parsedTags
        },
        { headers: authHeaders }
      );
      setArtists((previous) =>
        previous.map((artist) => (artist.id === response.data.id ? prepareArtist(response.data) : artist))
      );
      setArtistProfileForm(createArtistProfileFormState(response.data));
      setArtistProfileStatus({ type: 'success', message: '아티스트 정보가 저장되었습니다.' });
    } catch (error) {
      const message = extractAxiosErrorMessage(error, '아티스트 정보를 저장하지 못했습니다.');
      setArtistProfileStatus({ type: 'error', message });
    } finally {
      setArtistProfileSaving(false);
    }
  };
  const handleClipCardToggle = useCallback(
    (clip: ClipResponse) => {
      if (!clip.youtubeVideoId) {
        return;
      }
      setActiveClipId((previous) => {
        const next = previous === clip.id ? null : clip.id;
        if (next !== clipEditForm.clipId) {
          resetClipEditForm();
        }
        return next;
      });
    },
    [clipEditForm.clipId, resetClipEditForm]
  );
  const openClipEditor = useCallback(
    (clip: ClipResponse) => {
      const startParts = createClipTimePartValues(clip.startSec);
      const endParts = createClipTimePartValues(clip.endSec);
      setClipEditForm({
        clipId: clip.id,
        startHours: startParts.hours,
        startMinutes: startParts.minutes,
        startSeconds: startParts.seconds,
        endHours: endParts.hours,
        endMinutes: endParts.minutes,
        endSeconds: endParts.seconds
      });
      setClipEditStatus(null);
      setClipUpdateSaving(false);
    },
    []
  );
  const handleClipEditCancel = useCallback(() => {
    resetClipEditForm();
  }, [resetClipEditForm]);
  const handleClipEditSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (creationDisabled) {
      return;
    }
    if (clipEditForm.clipId === null) {
      setClipEditStatus({ type: 'error', message: '편집할 클립을 선택해 주세요.' });
      return;
    }

    const targetClip = clips.find((clip) => clip.id === clipEditForm.clipId);
    if (!targetClip) {
      setClipEditStatus({ type: 'error', message: '클립 정보를 불러올 수 없습니다.' });
      return;
    }

    const startSec = parseClipTimeParts(
      clipEditForm.startHours,
      clipEditForm.startMinutes,
      clipEditForm.startSeconds
    );
    const endSec = parseClipTimeParts(
      clipEditForm.endHours,
      clipEditForm.endMinutes,
      clipEditForm.endSeconds
    );

    if (endSec <= startSec) {
      setClipEditStatus({ type: 'error', message: '종료 시간은 시작 시간보다 커야 합니다.' });
      return;
    }

    setClipUpdateSaving(true);
    setClipEditStatus(null);

    try {
      const response = await http.put<ClipResponse>(
        `/clips/${clipEditForm.clipId}`,
        { startSec, endSec },
        { headers: authHeaders }
      );

      const updatedClip = response.data;

      setClips((previous) =>
        previous.map((clip) => (clip.id === updatedClip.id ? { ...clip, ...updatedClip } : clip))
      );
      setClipCandidates((previous) =>
        previous.map((candidate) =>
          candidate.startSec === targetClip.startSec && candidate.endSec === targetClip.endSec
            ? { ...candidate, startSec: updatedClip.startSec, endSec: updatedClip.endSec }
            : candidate
        )
      );

      openClipEditor(updatedClip);
      setClipEditStatus({ type: 'success', message: '클립 시간이 저장되었습니다.' });
    } catch (error) {
      const message = extractAxiosErrorMessage(error, '클립 시간을 저장하지 못했습니다.');
      setClipEditStatus({ type: 'error', message });
    } finally {
      setClipUpdateSaving(false);
    }
  };
  const selectedVideoData = selectedVideo
    ? artistLibraryVideos.find((video) => video.id === selectedVideo)
    : null;
  const selectedVideoSectionsWithCandidates = useMemo(
    () => mergeSections(selectedVideoData?.sections ?? [], autoDetectedSections),
    [selectedVideoData, autoDetectedSections]
  );
  const artistLibraryVideoMap = useMemo(() => {
    const map = new Map<number, VideoResponse>();
    artistLibraryVideos.forEach((video) => {
      map.set(video.id, video);
    });
    return map;
  }, [artistLibraryVideos]);
  useEffect(() => {
    if (!isLibraryClipFormOpen || !isClipRegistration) {
      return;
    }

    if (!selectedVideo || !selectedVideoData) {
      return;
    }

    if (creationDisabled) {
      return;
    }

    if (
      autoDetectedVideoIdRef.current === selectedVideo &&
      (clipCandidates.length > 0 || autoDetectInFlightRef.current)
    ) {
      return;
    }

    autoDetectedVideoIdRef.current = selectedVideo;
    void runAutoDetect();
  }, [
    clipCandidates.length,
    creationDisabled,
    isClipRegistration,
    isLibraryClipFormOpen,
    runAutoDetect,
    selectedVideo,
    selectedVideoData
  ]);
  const selectedVideoIsHidden = selectedVideo !== null && hiddenVideoIdSet.has(selectedVideo);
  const selectedVideoCategory = useMemo<VideoCategoryKey | null>(
    () => (selectedVideoData ? categorizeVideo(selectedVideoData) : null),
    [selectedVideoData]
  );
  const shouldShowSelectedVideoPreview = selectedVideoData
    ? selectedVideoIsHidden ||
      (selectedVideoCategory ? expandedVideoCategories[selectedVideoCategory] : false)
    : false;
  const displayableVideos = useMemo(
    () => artistLibraryVideos.filter((video) => !hiddenVideoIdSet.has(video.id)),
    [artistLibraryVideos, hiddenVideoIdSet]
  );
  const categorizedVideos = useMemo(() => {
    const groups: Record<VideoCategoryKey, VideoResponse[]> = {
      cover: [],
      live: [],
      original: []
    };
    displayableVideos.forEach((video) => {
      const category = categorizeVideo(video);
      groups[category].push(video);
    });
    return groups;
  }, [displayableVideos]);
  const clipSourceVideos = useMemo(
    () => displayableVideos.filter((video) => isClipSourceVideo(video)),
    [displayableVideos]
  );
  const officialVideos = useMemo(
    () => displayableVideos.filter((video) => !isClipSourceVideo(video)),
    [displayableVideos]
  );
  const canModifyActivePlaylist = Boolean(isAuthenticated && activePlaylist);

  const clipListItemData = useMemo<ClipListItemData>(
    () => ({
      activeClipId,
      clipEditForm,
      clipEditStatus,
      selectedVideoData: selectedVideoData ?? null,
      creationDisabled,
      isClipUpdateSaving,
      hasPlaybackPlayer,
      canModifyPlaylist: canModifyActivePlaylist,
      playlistClipItemMap,
      handleClipPlaylistToggle,
      getParentVideo: (clip: ClipResponse) => artistLibraryVideoMap.get(clip.videoId) ?? null,
      addToQueue
    }),
    [
      activeClipId,
      clipEditForm,
      clipEditStatus,
      selectedVideoData,
      creationDisabled,
      isClipUpdateSaving,
      hasPlaybackPlayer,
      canModifyActivePlaylist,
      playlistClipItemMap,
      handleClipPlaylistToggle,
      artistLibraryVideoMap,
      addToQueue
    ]
  );

  const activeClipPreview = useMemo<ClipPreviewData | null>(() => {
    if (activeSection !== 'library') {
      return null;
    }
    if (activeClipId === null) {
      return null;
    }

    const clip = artistLibraryClips.find((candidate) => candidate.id === activeClipId);
    if (!clip) {
      return null;
    }
    const youtubeVideoId = (clip.youtubeVideoId ?? '').trim();
    if (!youtubeVideoId) {
      return null;
    }

    const parentVideo =
      (selectedVideoData && selectedVideoData.id === clip.videoId ? selectedVideoData : null) ??
      artistLibraryVideos.find((video) => video.id === clip.videoId) ??
      null;
    const isEditingClip = clipEditForm.clipId === clip.id;
    const editedStartSec = isEditingClip
      ? parseClipTimeParts(
          clipEditForm.startHours,
          clipEditForm.startMinutes,
          clipEditForm.startSeconds
        )
      : clip.startSec;
    const editedEndSec = isEditingClip
      ? parseClipTimeParts(clipEditForm.endHours, clipEditForm.endMinutes, clipEditForm.endSeconds)
      : clip.endSec;
    const previewStartSec = editedStartSec;
    const previewEndSec =
      isEditingClip && editedEndSec <= editedStartSec ? editedStartSec + 1 : editedEndSec;

    const clipOriginalComposerTag =
      typeof clip.originalComposer === 'string' ? clip.originalComposer.trim() : '';
    const clipArtistName = (
      clip.artistDisplayName ??
      clip.artistName ??
      parentVideo?.artistDisplayName ??
      parentVideo?.artistName ??
      ''
    ).trim();
    const clipCategory = categorizeClip(clip, parentVideo ?? null);
    const clipVocalTag =
      clipCategory && clipCategory !== 'live' && clipArtistName ? `보컬:${clipArtistName}` : null;
    const clipTagValues = buildTagList(
      clipOriginalComposerTag ? `원곡:${clipOriginalComposerTag}` : null,
      clipVocalTag,
      clip.tags
    );

    const clipTitleSource =
      typeof clip.title === 'string' && clip.title.trim().length > 0
        ? clip.title
        : clip.sectionTitle || clip.youtubeChapterTitle || '제목 없는 클립';
    const clipTitle = clipTitleSource.trim() || '제목 없는 클립';
    const videoTitleSource =
      clip.videoTitle ||
      parentVideo?.title ||
      parentVideo?.youtubeVideoId ||
      clip.youtubeVideoId ||
      '';
    const videoTitle = typeof videoTitleSource === 'string' ? videoTitleSource.trim() : '';
    const rangeLabel = `${formatSeconds(previewStartSec)} → ${formatSeconds(previewEndSec)}`;

    return {
      clipId: clip.id,
      clipTitle,
      videoTitle,
      youtubeVideoId,
      startSec: previewStartSec,
      endSec: previewEndSec,
      rangeLabel,
      tags: clipTagValues,
      isEditing: isEditingClip
    } satisfies ClipPreviewData;
  }, [
    activeSection,
    activeClipId,
    artistLibraryClips,
    clipEditForm.clipId,
    clipEditForm.startHours,
    clipEditForm.startMinutes,
    clipEditForm.startSeconds,
    clipEditForm.endHours,
    clipEditForm.endMinutes,
    clipEditForm.endSeconds,
    selectedVideoData,
    artistLibraryVideos
  ]);

  const renderClipListItem = useCallback(
    (
      clip: ClipResponse,
      { isVisible, itemData }: ClipListRenderContext<ClipResponse, ClipListItemData>
    ): ClipListRenderResult => {
      const {
        activeClipId: currentActiveClipId,
        clipEditForm: currentClipEditForm,
        clipEditStatus: currentClipEditStatus,
        selectedVideoData: currentSelectedVideo,
        creationDisabled: currentCreationDisabled,
        isClipUpdateSaving: currentClipUpdateSaving,
        hasPlaybackPlayer: currentHasPlaybackPlayer,
        canModifyPlaylist,
        playlistClipItemMap: currentPlaylistClipItemMap,
        handleClipPlaylistToggle: toggleClipPlaylist,
        getParentVideo,
        addToQueue: enqueueClip
      } = itemData;

      const isActive = currentActiveClipId === clip.id;
      const hasYoutubeId = Boolean(clip.youtubeVideoId);
      const isEditingClip = currentClipEditForm.clipId === clip.id;
      const clipOriginalComposerTag =
        typeof clip.originalComposer === 'string' ? clip.originalComposer.trim() : '';
      const parentVideo = getParentVideo(clip);
      const clipArtistName = (
        clip.artistDisplayName ??
        clip.artistName ??
        parentVideo?.artistDisplayName ??
        parentVideo?.artistName ??
        ''
      ).trim();
      const clipCategory = categorizeClip(clip, parentVideo ?? null);
      const clipVocalTag =
        clipCategory && clipCategory !== 'live' && clipArtistName ? `보컬:${clipArtistName}` : null;
      const clipTagValues = buildTagList(
        clipOriginalComposerTag ? `원곡:${clipOriginalComposerTag}` : null,
        clipVocalTag,
        clip.tags
      );
      const playlistClipItem = currentPlaylistClipItemMap.get(clip.id) ?? null;
      const isClipQueued = playlistClipItem !== null;
      const isPlaylistToggleDisabled = !hasYoutubeId || !canModifyPlaylist;

      const className = `artist-library__clip-card${
        isActive ? ' artist-library__clip-card--active' : ''
      }${hasYoutubeId ? '' : ' artist-library__clip-card--disabled'}`;

      const content = (
        <>
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
            {clipTagValues.length > 0 && (
              <div className="artist-library__clip-tags">
                {clipTagValues.map((tag) => (
                  <span key={tag} className="tag">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </button>
          <button
            type="button"
            className="add-to-queue-btn"
            onClick={(event) => {
              event.stopPropagation();
              enqueueClip(clip);
            }}
            aria-label="재생목록에 추가"
            disabled={!hasYoutubeId}
          >
            +
          </button>
          <div className="artist-library__clip-footer">
            <button
              type="button"
              className={`artist-library__video-action artist-library__video-action--playlist${
                isClipQueued ? ' active' : ''
              }${isPlaylistToggleDisabled ? ' is-disabled' : ''}`}
              aria-pressed={isClipQueued}
              aria-label={isClipQueued ? '재생목록에서 제거' : '재생목록에 추가'}
              aria-disabled={!canModifyPlaylist}
              disabled={isPlaylistToggleDisabled}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void toggleClipPlaylist(clip.id);
              }}
            >
              {isClipQueued ? '재생목록 추가됨' : '재생목록에 추가'}
            </button>
            {clip.youtubeVideoId && (
              <a
                className="artist-library__clip-link"
                href={`https://www.youtube.com/watch?v=${clip.youtubeVideoId}&t=${Math.floor(
                  clip.startSec
                )}s`}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => event.stopPropagation()}
              >
                유튜브에서 보기
              </a>
            )}
          </div>
          {isActive && (
            <div className="artist-library__clip-editor">
              {isEditingClip ? (
                <form className="clip-edit-form" onSubmit={handleClipEditSubmit}>
                  <div className="clip-edit-form__fields">
                    <fieldset className="clip-time-fieldset">
                      <legend>시작 시간</legend>
                      <div className="clip-time-quick-actions">
                        <button
                          type="button"
                          className="clip-time-quickset"
                          onClick={() => applyPlaybackPositionToClipEditForm('start')}
                          disabled={!currentHasPlaybackPlayer || currentClipUpdateSaving}
                        >
                          현재 위치로 시작 설정
                        </button>
                      </div>
                      {shouldUseCompactTimeInputs ? (
                        <div className="clip-time-inputs clip-time-inputs--compact">
                          <label htmlFor={`clipEditStartTotal-${clip.id}`}>총 초</label>
                          <input
                            id={`clipEditStartTotal-${clip.id}`}
                            type="text"
                            inputMode="numeric"
                            placeholder="0"
                            value={clipEditStartCompactValue}
                            onChange={handleClipEditCompactTimeChange('start')}
                            disabled={currentClipUpdateSaving}
                          />
                          <p className="clip-time-hint">
                            현재 {formatSeconds(parseClipTimeParts(
                              currentClipEditForm.startHours,
                              currentClipEditForm.startMinutes,
                              currentClipEditForm.startSeconds
                            ))}
                          </p>
                        </div>
                      ) : (
                        <div className="clip-time-inputs">
                          <div className="clip-time-input">
                            <label htmlFor={`clipEditStartHours-${clip.id}`}>시간</label>
                            <input
                              id={`clipEditStartHours-${clip.id}`}
                              type="text"
                              inputMode="numeric"
                              placeholder="0"
                              maxLength={3}
                              value={currentClipEditForm.startHours}
                              onChange={handleClipEditTimePartChange('startHours')}
                              disabled={currentClipUpdateSaving}
                            />
                          </div>
                          <div className="clip-time-input">
                            <label htmlFor={`clipEditStartMinutes-${clip.id}`}>분</label>
                            <input
                              id={`clipEditStartMinutes-${clip.id}`}
                              type="text"
                              inputMode="numeric"
                              placeholder="00"
                              maxLength={2}
                              value={currentClipEditForm.startMinutes}
                              onChange={handleClipEditTimePartChange('startMinutes')}
                              disabled={currentClipUpdateSaving}
                            />
                          </div>
                          <div className="clip-time-input">
                            <label htmlFor={`clipEditStartSeconds-${clip.id}`}>초</label>
                            <input
                              id={`clipEditStartSeconds-${clip.id}`}
                              type="text"
                              inputMode="numeric"
                              placeholder="00"
                              maxLength={2}
                              value={currentClipEditForm.startSeconds}
                              onChange={handleClipEditTimePartChange('startSeconds')}
                              disabled={currentClipUpdateSaving}
                            />
                          </div>
                        </div>
                      )}
                    </fieldset>
                    <fieldset className="clip-time-fieldset">
                      <legend>종료 시간</legend>
                      <div className="clip-time-quick-actions">
                        <button
                          type="button"
                          className="clip-time-quickset"
                          onClick={() => applyPlaybackPositionToClipEditForm('end')}
                          disabled={!currentHasPlaybackPlayer || currentClipUpdateSaving}
                        >
                          현재 위치로 종료 설정
                        </button>
                      </div>
                      {shouldUseCompactTimeInputs ? (
                        <div className="clip-time-inputs clip-time-inputs--compact">
                          <label htmlFor={`clipEditEndTotal-${clip.id}`}>총 초</label>
                          <input
                            id={`clipEditEndTotal-${clip.id}`}
                            type="text"
                            inputMode="numeric"
                            placeholder="0"
                            value={clipEditEndCompactValue}
                            onChange={handleClipEditCompactTimeChange('end')}
                            disabled={currentClipUpdateSaving}
                          />
                          <p className="clip-time-hint">
                            현재 {formatSeconds(parseClipTimeParts(
                              currentClipEditForm.endHours,
                              currentClipEditForm.endMinutes,
                              currentClipEditForm.endSeconds
                            ))}
                          </p>
                        </div>
                      ) : (
                        <div className="clip-time-inputs">
                          <div className="clip-time-input">
                            <label htmlFor={`clipEditEndHours-${clip.id}`}>시간</label>
                            <input
                              id={`clipEditEndHours-${clip.id}`}
                              type="text"
                              inputMode="numeric"
                              placeholder="0"
                              maxLength={3}
                              value={currentClipEditForm.endHours}
                              onChange={handleClipEditTimePartChange('endHours')}
                              disabled={currentClipUpdateSaving}
                            />
                          </div>
                          <div className="clip-time-input">
                            <label htmlFor={`clipEditEndMinutes-${clip.id}`}>분</label>
                            <input
                              id={`clipEditEndMinutes-${clip.id}`}
                              type="text"
                              inputMode="numeric"
                              placeholder="00"
                              maxLength={2}
                              value={currentClipEditForm.endMinutes}
                              onChange={handleClipEditTimePartChange('endMinutes')}
                              disabled={currentClipUpdateSaving}
                            />
                          </div>
                          <div className="clip-time-input">
                            <label htmlFor={`clipEditEndSeconds-${clip.id}`}>초</label>
                            <input
                              id={`clipEditEndSeconds-${clip.id}`}
                              type="text"
                              inputMode="numeric"
                              placeholder="00"
                              maxLength={2}
                              value={currentClipEditForm.endSeconds}
                              onChange={handleClipEditTimePartChange('endSeconds')}
                              disabled={currentClipUpdateSaving}
                            />
                          </div>
                        </div>
                      )}
                    </fieldset>
                  </div>
                  {currentClipEditStatus && isEditingClip && (
                    <p className={`clip-edit-status clip-edit-status--${currentClipEditStatus.type}`}>
                      {currentClipEditStatus.message}
                    </p>
                  )}
                  <div className="clip-edit-actions">
                    <button type="submit" disabled={currentClipUpdateSaving}>
                      적용
                    </button>
                    <button
                      type="button"
                      className="clip-edit-cancel"
                      onClick={handleClipEditCancel}
                      disabled={currentClipUpdateSaving}
                    >
                      취소
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  className="clip-edit-toggle"
                  onClick={() => openClipEditor(clip)}
                  disabled={currentCreationDisabled || !hasYoutubeId || currentClipUpdateSaving}
                >
                  시간 수정
                </button>
              )}
            </div>
          )}
        </>
      );

      return { className, content } satisfies ClipListRenderResult;
    },
    [
      handleClipCardToggle,
      handleClipEditSubmit,
      handleClipEditTimePartChange,
      handleClipEditCancel,
      openClipEditor,
      handleClipPlaylistToggle
    ]
  );

  const resolvePlaylistEntryKey = useCallback((entry: PlaylistEntry, index: number): string => {
    if (Number.isFinite(entry.itemId)) {
      return `playlist-item-${entry.itemId}`;
    }
    if (entry.type === 'video') {
      return `playlist-video-${entry.video.id}-${index}`;
    }
    const clipId = typeof entry.clip.id === 'number' ? entry.clip.id : null;
    if (clipId !== null) {
      return `playlist-clip-${clipId}`;
    }
    return `playlist-clip-${entry.clip.videoId}-${index}`;
  }, []);

  const playlistEntries = useMemo<PlaylistEntry[]>(() => {
    return playlistItems
      .map<PlaylistEntry | null>((item) => {
        if (item.type === 'video' && item.video) {
          return { type: 'video', itemId: item.id, video: item.video };
        }
        if (item.type === 'clip' && item.clip) {
          const parentVideo = playlistVideoMap.get(item.clip.videoId) ?? null;
          return { type: 'clip', itemId: item.id, clip: item.clip, parentVideo };
        }
        return null;
      })
      .filter((entry): entry is PlaylistEntry => entry !== null);
  }, [playlistItems, playlistVideoMap]);

  const isPlaylistEntryRemovalDisabled = !activePlaylist;

  const playlistPlaybackItems = useMemo<PlaylistBarItem[]>(() => {
    return playlistEntries.map((entry, index) => {
      const key = resolvePlaylistEntryKey(entry, index);

      if (entry.type === 'video') {
        return createPlaylistVideoBarItem({ video: entry.video, itemId: entry.itemId, key });
      }

      const parentVideo = entry.parentVideo;

      return createPlaylistClipBarItem({
        clip: entry.clip,
        parentVideo,
        itemId: entry.itemId,
        key
      });
    });
  }, [createPlaylistClipBarItem, createPlaylistVideoBarItem, playlistEntries, resolvePlaylistEntryKey]);

  const playbackBarItems = useMemo<PlaylistBarItem[]>(() => {
    return [...adHocPlaybackItems, ...playlistPlaybackItems];
  }, [adHocPlaybackItems, playlistPlaybackItems]);


  const hasPlaybackItems = playbackBarItems.length > 0;

  const currentPlaybackIndex = useMemo(() => {
    if (!activePlaybackKey) {
      return -1;
    }
    return playbackBarItems.findIndex((item) => item.key === activePlaybackKey);
  }, [activePlaybackKey, playbackBarItems]);

  const currentPlaybackItem = useMemo(() => {
    if (currentPlaybackIndex < 0) {
      return null;
    }
    return playbackBarItems[currentPlaybackIndex] ?? null;
  }, [currentPlaybackIndex, playbackBarItems]);

  useEffect(() => {
    if (playbackBarItems.length === 0) {
      setActivePlaybackKey(null);
      setIsPlaybackActive(false);
      setIsPlaybackExpanded(false);
      setIsFullPlayerOpen(false);
      setLatestPlaybackNotice(null);
      setLatestVideoPreviewMessage(null);
      return;
    }

    setActivePlaybackKey((previous) => {
      if (previous && playbackBarItems.some((item) => item.key === previous)) {
        return previous;
      }
      const fallback = playbackBarItems.find((item) => item.isPlayable) ?? playbackBarItems[0];
      return fallback ? fallback.key : previous;
    });
  }, [playbackBarItems]);

  useEffect(() => {
    if (isPlaybackActive && !playbackBarItems.some((item) => item.isPlayable)) {
      setIsPlaybackActive(false);
    }
  }, [isPlaybackActive, playbackBarItems]);

  const activatePlaybackItem = useCallback(
    (item: PlaylistBarItem | null | undefined) => {
      if (!item || !item.isPlayable) {
        return false;
      }
      setPlaybackActivationNonce((previous) => previous + 1);
      setActivePlaybackKey(item.key);
      setIsPlaybackActive(true);
      return true;
    },
    []
  );

  const findNextPlayableItem = useCallback(
    (startIndex: number) => {
      for (let index = startIndex + 1; index < playbackBarItems.length; index += 1) {
        const candidate = playbackBarItems[index];
        if (candidate.isPlayable) {
          return candidate;
        }
      }
      return null;
    },
    [playbackBarItems]
  );

  const findPreviousPlayableItem = useCallback(
    (startIndex: number) => {
      for (let index = startIndex - 1; index >= 0; index -= 1) {
        const candidate = playbackBarItems[index];
        if (candidate.isPlayable) {
          return candidate;
        }
      }
      return null;
    },
    [playbackBarItems]
  );

  const handlePlaybackToggle = useCallback(() => {
    if (playbackBarItems.length === 0) {
      return;
    }
    if (!currentPlaybackItem || !currentPlaybackItem.isPlayable) {
      const nextPlayable = playbackBarItems.find((item) => item.isPlayable);
      if (nextPlayable) {
        activatePlaybackItem(nextPlayable);
      }
      return;
    }

    setIsPlaybackActive((previous) => !previous);
  }, [activatePlaybackItem, currentPlaybackItem, playbackBarItems]);

  const handlePlaybackNext = useCallback(() => {
    if (playbackBarItems.length === 0) {
      return;
    }

    const startIndex = currentPlaybackIndex >= 0 ? currentPlaybackIndex : -1;
    const nextItem = findNextPlayableItem(startIndex);
    if (activatePlaybackItem(nextItem)) {
      return;
    }

    if (playbackRepeatMode === 'all') {
      const wrappedItem = findNextPlayableItem(-1);
      if (activatePlaybackItem(wrappedItem)) {
        return;
      }
    }

    if (playbackRepeatMode === 'one') {
      if (activatePlaybackItem(currentPlaybackItem)) {
        return;
      }
    }

    setIsPlaybackActive(false);
  }, [
    activatePlaybackItem,
    currentPlaybackIndex,
    currentPlaybackItem,
    findNextPlayableItem,
    playbackBarItems,
    playbackRepeatMode
  ]);

  const handlePlaybackPrevious = useCallback(() => {
    if (playbackBarItems.length === 0) {
      return;
    }

    const startIndex =
      currentPlaybackIndex >= 0 ? currentPlaybackIndex : playbackBarItems.length;
    const previousItem = findPreviousPlayableItem(startIndex);
    if (activatePlaybackItem(previousItem)) {
      return;
    }

    if (playbackRepeatMode === 'all') {
      const wrappedItem = findPreviousPlayableItem(playbackBarItems.length);
      if (activatePlaybackItem(wrappedItem)) {
        return;
      }
    }

    if (playbackRepeatMode === 'one') {
      activatePlaybackItem(currentPlaybackItem);
    }
  }, [
    activatePlaybackItem,
    currentPlaybackIndex,
    currentPlaybackItem,
    findPreviousPlayableItem,
    playbackBarItems,
    playbackRepeatMode
  ]);

  const handlePlaybackSelect = useCallback(
    (key: string) => {
      const target = playbackBarItems.find((item) => item.key === key);
      if (!target) {
        return;
      }
      if (target.isPlayable) {
        activatePlaybackItem(target);
        return;
      }
      setActivePlaybackKey(target.key);
    },
    [activatePlaybackItem, playbackBarItems]
  );

  const handlePlaybackToggleExpanded = useCallback(() => {
    if (isMobileViewport) {
      setIsFullPlayerOpen((previous) => !previous);
      return;
    }
    setIsPlaybackExpanded((previous) => !previous);
  }, [isMobileViewport]);

  const handleMiniPlayerClick = useCallback(() => {
    if (isMobileViewport && hasPlaybackItems) {
      setIsFullPlayerOpen(true);
    }
  }, [hasPlaybackItems, isMobileViewport]);

  const handleMobileQueueClose = useCallback(() => {
    setIsFullPlayerOpen(false);
  }, []);

  const handlePlaybackEnded = useCallback(() => {
    if (playbackBarItems.length === 0) {
      setIsPlaybackActive(false);
      return;
    }

    if (playbackRepeatMode === 'one') {
      if (activatePlaybackItem(currentPlaybackItem)) {
        return;
      }
    }

    const startIndex = currentPlaybackIndex >= 0 ? currentPlaybackIndex : -1;
    const nextItem = findNextPlayableItem(startIndex);
    if (activatePlaybackItem(nextItem)) {
      return;
    }

    if (playbackRepeatMode === 'all') {
      const wrappedItem = findNextPlayableItem(-1);
      if (activatePlaybackItem(wrappedItem)) {
        return;
      }
    }

    setIsPlaybackActive(false);
  }, [
    activatePlaybackItem,
    currentPlaybackIndex,
    currentPlaybackItem,
    findNextPlayableItem,
    playbackBarItems,
    playbackRepeatMode
  ]);

  const normalizedPlaylistQuery = playlistSearchQuery.trim().toLowerCase();

  const filteredPlaylistEntries = useMemo<PlaylistEntry[]>(() => {
    if (normalizedPlaylistQuery.length === 0) {
      return playlistEntries;
    }

    const matchesVideo = (video: VideoResponse): boolean => {
      const fields = [
        video.title,
        video.youtubeVideoId,
        video.artistName,
        video.artistDisplayName,
        video.artistYoutubeChannelTitle,
        video.originalComposer
      ];
      return fields.some((field) => field && field.toLowerCase().includes(normalizedPlaylistQuery));
    };

    const matchesClip = (clip: ClipResponse, video: VideoResponse | null): boolean => {
      const tagText = Array.isArray(clip.tags) ? clip.tags.join(' ') : '';
      const fields = [
        clip.title,
        clip.videoTitle ?? undefined,
        clip.youtubeVideoId,
        tagText,
        clip.originalComposer ?? undefined,
        clip.videoOriginalComposer ?? undefined,
        clip.artistName ?? undefined,
        clip.artistDisplayName ?? undefined,
        clip.artistYoutubeChannelTitle ?? undefined,
        video?.title,
        video?.youtubeVideoId,
        video?.artistName,
        video?.artistDisplayName,
        video?.artistYoutubeChannelTitle,
        video?.originalComposer
      ];
      return fields.some((field) => field && field.toLowerCase().includes(normalizedPlaylistQuery));
    };

    const results: PlaylistEntry[] = [];
    let pendingVideoEntry: PlaylistEntry | null = null;
    let pendingVideoMatches = false;
    let pendingClipEntries: PlaylistEntry[] = [];
    let pendingClipMatches: PlaylistEntry[] = [];

    const flushPending = () => {
      if (!pendingVideoEntry) {
        return;
      }
      if (pendingVideoMatches) {
        results.push(pendingVideoEntry, ...pendingClipEntries);
      } else if (pendingClipMatches.length > 0) {
        results.push(pendingVideoEntry, ...pendingClipMatches);
      }
      pendingVideoEntry = null;
      pendingVideoMatches = false;
      pendingClipEntries = [];
      pendingClipMatches = [];
    };

    playlistEntries.forEach((entry) => {
      if (entry.type === 'video') {
        flushPending();
        pendingVideoEntry = entry;
        pendingVideoMatches = matchesVideo(entry.video);
        pendingClipEntries = [];
        pendingClipMatches = [];
        return;
      }

      const clipParent = entry.parentVideo;
      const clipMatches = matchesClip(entry.clip, clipParent);

      if (pendingVideoEntry && pendingVideoEntry.type === 'video' && clipParent && clipParent.id === pendingVideoEntry.video.id) {
        pendingClipEntries.push(entry);
        if (clipMatches) {
          pendingClipMatches.push(entry);
        }
      } else if (clipMatches) {
        flushPending();
        results.push(entry);
      }
    });

    flushPending();

    return results;
  }, [normalizedPlaylistQuery, playlistEntries]);

  const playlistHasResults = filteredPlaylistEntries.length > 0;

  const filteredPlaybackBarItems = useMemo(() => {
    if (normalizedPlaylistQuery.length === 0) {
      return playbackBarItems;
    }
    const filteredIds = new Set(filteredPlaylistEntries.map((entry) => entry.itemId));
    return playbackBarItems.filter((item) => item.itemId < 0 || filteredIds.has(item.itemId));
  }, [filteredPlaylistEntries, normalizedPlaylistQuery, playbackBarItems]);

  const handleMobileQueueRemove = useCallback(
    (index: number) => {
      const targetItem = filteredPlaybackBarItems[index];
      if (!targetItem) {
        return;
      }
      handlePlaybackQueueRemove(targetItem.itemId);
    },
    [filteredPlaybackBarItems, handlePlaybackQueueRemove]
  );

  const handleMobileQueueSelect = useCallback(
    (clip: PlaylistBarItem) => {
      handlePlaybackSelect(clip.key);
    },
    [handlePlaybackSelect]
  );

  useEffect(() => {
    if (!expandedPlaylistEntryId) {
      return;
    }

    const entryExists = filteredPlaylistEntries.some(
      (entry, index) => resolvePlaylistEntryKey(entry, index) === expandedPlaylistEntryId
    );

    if (!entryExists) {
      setExpandedPlaylistEntryId(null);
    }
  }, [expandedPlaylistEntryId, filteredPlaylistEntries, resolvePlaylistEntryKey]);
  useEffect(() => {
    setActiveClipId((previous) =>
      previous && artistLibraryClips.some((clip) => clip.id === previous) ? previous : null
    );
  }, [artistLibraryClips]);
  const playlistSubtitle = isAuthenticated
    ? '저장한 영상과 클립을 검색하고 바로 재생해 보세요.'
    : '회원가입 없이 감상할 수 있는 최신 공개 재생목록입니다.';
  const playlistSelectorLabel = isAuthenticated ? '내 재생목록' : '공개 재생목록';
  const playlistSelectionValue = activePlaylist ? String(activePlaylist.id) : '';
  const playlistEmptyMessage = normalizedPlaylistQuery.length > 0
    ? '검색 조건에 맞는 영상이나 클립이 없습니다.'
    : isAuthenticated
      ? '저장된 영상이나 클립이 없습니다. 라이브러리에서 새로운 클립을 추가해 보세요.'
      : '아직 공개된 재생목록이 없습니다. 잠시 후 다시 확인해 주세요.';
  const parsedPreviewStartSec = useMemo(
    () => parseClipTimeParts(clipForm.startHours, clipForm.startMinutes, clipForm.startSeconds),
    [clipForm.startHours, clipForm.startMinutes, clipForm.startSeconds]
  );
  const parsedPreviewEndSec = useMemo(
    () => parseClipTimeParts(clipForm.endHours, clipForm.endMinutes, clipForm.endSeconds),
    [clipForm.endHours, clipForm.endMinutes, clipForm.endSeconds]
  );
  const previewStartSec = Math.max(0, parsedPreviewStartSec || 0);
  const selectedVideoDurationSec = parseDurationSeconds(selectedVideoData?.durationSec);
  const fallbackEnd = selectedVideoDurationSec !== null
    ? Math.min(selectedVideoDurationSec, previewStartSec + 30)
    : previewStartSec + 30;
  const previewEndSec = parsedPreviewEndSec > previewStartSec ? parsedPreviewEndSec : fallbackEnd;
  const clipStartFieldsEmpty =
    clipForm.startHours === '' && clipForm.startMinutes === '' && clipForm.startSeconds === '';
  const clipEndFieldsEmpty =
    clipForm.endHours === '' && clipForm.endMinutes === '' && clipForm.endSeconds === '';
  const clipStartCompactValue = clipStartFieldsEmpty
    ? ''
    : String(parseClipTimeParts(clipForm.startHours, clipForm.startMinutes, clipForm.startSeconds));
  const clipEndCompactValue = clipEndFieldsEmpty
    ? ''
    : String(parseClipTimeParts(clipForm.endHours, clipForm.endMinutes, clipForm.endSeconds));
  const shouldUseCompactTimeInputs = isMobileViewport;
  const clipRangeMax = useMemo(() => {
    if (selectedVideoDurationSec && selectedVideoDurationSec > 0) {
      return selectedVideoDurationSec;
    }
    return Math.max(previewEndSec, previewStartSec + 60);
  }, [previewEndSec, previewStartSec, selectedVideoDurationSec]);
  const clipRangeStartPercent = clipRangeMax > 0 ? Math.min((previewStartSec / clipRangeMax) * 100, 100) : 0;
  const clipRangeEndPercent = clipRangeMax > 0 ? Math.min((previewEndSec / clipRangeMax) * 100, 100) : 0;
  const updateClipStartFromSlider = useCallback(
    (nextStartSec: number, options?: { preview?: boolean }) => {
      const clampedStart = clamp(normalizeClipSeconds(nextStartSec), 0, clipRangeMax);
      setClipForm((prev) => {
        const endSeconds = parseClipTimeParts(prev.endHours, prev.endMinutes, prev.endSeconds);
        const adjustedEnd = endSeconds > clampedStart ? endSeconds : clampedStart + 15;
        const safeEnd = Math.min(Math.max(clampedStart + CLIP_NUDGE_STEP, adjustedEnd), clipRangeMax);
        const normalizedEnd = normalizeClipSeconds(safeEnd);
        const startParts = createClipTimePartValues(clampedStart);
        const endParts = createClipTimePartValues(normalizedEnd);
        return {
          ...prev,
          startHours: startParts.hours,
          startMinutes: startParts.minutes,
          startSeconds: startParts.seconds,
          endHours: endParts.hours,
          endMinutes: endParts.minutes,
          endSeconds: endParts.seconds
        };
      });
      if (options?.preview) {
        previewClipPosition(clampedStart);
      }
    },
    [clipRangeMax, previewClipPosition]
  );
  const updateClipEndFromSlider = useCallback(
    (nextEndSec: number, options?: { preview?: boolean }) => {
      const minimumEnd = normalizeClipSeconds(previewStartSec + CLIP_NUDGE_STEP);
      const clampedEnd = clamp(normalizeClipSeconds(nextEndSec), minimumEnd, clipRangeMax);
      setClipForm((prev) => {
        const endParts = createClipTimePartValues(clampedEnd);
        return {
          ...prev,
          endHours: endParts.hours,
          endMinutes: endParts.minutes,
          endSeconds: endParts.seconds
        };
      });
      if (options?.preview) {
        previewClipPosition(Math.max(clampedEnd - CLIP_NUDGE_LARGE_STEP, previewStartSec));
      }
    },
    [clipRangeMax, previewStartSec, previewClipPosition]
  );
  const applyFullVideoRange = useCallback(() => {
    updateClipStartFromSlider(0);
    updateClipEndFromSlider(clipRangeMax);
  }, [clipRangeMax, updateClipEndFromSlider, updateClipStartFromSlider]);
  const applyThirtySecondRange = useCallback(() => {
    updateClipEndFromSlider(Math.min(previewStartSec + 30, clipRangeMax));
  }, [clipRangeMax, previewStartSec, updateClipEndFromSlider]);
  const nudgeClipBoundary = useCallback(
    (target: 'start' | 'end', delta: number, options?: { preview?: boolean }) => {
      if (target === 'start') {
        updateClipStartFromSlider(previewStartSec + delta, options);
        return;
      }
      updateClipEndFromSlider(previewEndSec + delta, options);
    },
    [previewEndSec, previewStartSec, updateClipEndFromSlider, updateClipStartFromSlider]
  );
  const handleRangeKeyDown = useCallback(
    (target: 'start' | 'end') => (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        const magnitude = event.shiftKey ? CLIP_NUDGE_STEP : CLIP_KEYBOARD_STEP;
        const direction = event.key === 'ArrowLeft' ? -1 : 1;
        nudgeClipBoundary(target, magnitude * direction, { preview: true });
        event.preventDefault();
      }
    },
    [nudgeClipBoundary]
  );
  const applyPlaybackPositionToClipStart = useCallback(() => {
    const currentSeconds = getCurrentPlaybackSeconds();
    if (currentSeconds === null) {
      return;
    }
    updateClipStartFromSlider(currentSeconds);
  }, [getCurrentPlaybackSeconds, updateClipStartFromSlider]);
  const applyPlaybackPositionToClipEnd = useCallback(() => {
    const currentSeconds = getCurrentPlaybackSeconds();
    if (currentSeconds === null) {
      return;
    }
    updateClipEndFromSlider(currentSeconds);
  }, [getCurrentPlaybackSeconds, updateClipEndFromSlider]);
  const applyPlaybackPositionToClipEditForm = useCallback(
    (prefix: ClipTimePrefix) => {
      const currentSeconds = getCurrentPlaybackSeconds();
      if (currentSeconds === null) {
        return;
      }
      setClipEditForm((prev) => {
        const startValue = parseClipTimeParts(prev.startHours, prev.startMinutes, prev.startSeconds);
        const endValue = parseClipTimeParts(prev.endHours, prev.endMinutes, prev.endSeconds);
        if (prefix === 'start') {
          const adjustedEnd = endValue <= currentSeconds ? currentSeconds + 1 : endValue;
          const nextState = {
            ...prev,
            ...createClipTimePatch(createClipTimePartValues(currentSeconds), 'start')
          };
          return adjustedEnd !== endValue
            ? {
                ...nextState,
                ...createClipTimePatch(createClipTimePartValues(adjustedEnd), 'end')
              }
            : nextState;
        }
        const adjustedEndValue = currentSeconds <= startValue ? startValue + 1 : currentSeconds;
        return {
          ...prev,
          ...createClipTimePatch(createClipTimePartValues(adjustedEndValue), 'end')
        };
      });
      setClipEditStatus(null);
    },
    [getCurrentPlaybackSeconds]
  );
  // ✅ [추가] 클립 등록/수정 시 키보드 단축키(i, o) 지원
  useEffect(() => {
    // 폼이 열려있지 않으면 무시
    if (!isLibraryClipFormOpen && !clipEditForm.clipId) return;

    const handleHotkeys = (event: globalThis.KeyboardEvent) => {
      const activeTag = (event.target as HTMLElement | null)?.tagName;
      // 입력창에 타이핑 중일 때는 무시
      if (activeTag && ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag)) return;

      // I키: 시작 시간 설정 (In-point)
      if (event.key.toLowerCase() === 'i') {
        event.preventDefault();
        if (isLibraryClipFormOpen) applyPlaybackPositionToClipStart(); // 등록 폼용
        if (clipEditForm.clipId) applyPlaybackPositionToClipEditForm('start'); // 수정 폼용
        enqueueToast('시작 시간이 설정되었습니다.', 'info');
      }

      // O키: 종료 시간 설정 (Out-point)
      if (event.key.toLowerCase() === 'o') {
        event.preventDefault();
        if (isLibraryClipFormOpen) applyPlaybackPositionToClipEnd();
        if (clipEditForm.clipId) applyPlaybackPositionToClipEditForm('end');
        enqueueToast('종료 시간이 설정되었습니다.', 'info');
      }
    };

    window.addEventListener('keydown', handleHotkeys);
    return () => window.removeEventListener('keydown', handleHotkeys);
  }, [
    isLibraryClipFormOpen,
    clipEditForm.clipId,
    applyPlaybackPositionToClipStart,
    applyPlaybackPositionToClipEnd,
    applyPlaybackPositionToClipEditForm,
    enqueueToast
  ]);
  const handleClipCompactTimeChange = useCallback(
    (prefix: ClipTimePrefix) => (event: ChangeEvent<HTMLInputElement>) => {
      const sanitized = sanitizeSecondsInput(event.target.value);
      if (!sanitized) {
        setClipForm((prev) => ({ ...prev, ...createEmptyClipTimePatch(prefix) }));
        return;
      }
      const total = Number(sanitized);
      if (!Number.isFinite(total)) {
        return;
      }
      const parts = createClipTimePartValues(total);
      setClipForm((prev) => ({ ...prev, ...createClipTimePatch(parts, prefix) }));
    },
    []
  );
  const handleClipEditCompactTimeChange = useCallback(
    (prefix: ClipTimePrefix) => (event: ChangeEvent<HTMLInputElement>) => {
      const sanitized = sanitizeSecondsInput(event.target.value);
      setClipEditStatus(null);
      if (!sanitized) {
        setClipEditForm((prev) => ({ ...prev, ...createEmptyClipTimePatch(prefix) }));
        return;
      }
      const total = Number(sanitized);
      if (!Number.isFinite(total)) {
        return;
      }
      const parts = createClipTimePartValues(total);
      setClipEditForm((prev) => ({ ...prev, ...createClipTimePatch(parts, prefix) }));
    },
    []
  );

  const renderVideoListItem = (video: VideoResponse) => {
    const isVideoSelected = selectedVideo === video.id;
    const isVideoFavorited = favoriteVideoIds.includes(video.id);
    const playlistVideoItem = playlistVideoItemMap.get(video.id) ?? null;
    const isVideoQueued = playlistVideoItem !== null;
    const canModifyPlaylist = Boolean(isAuthenticated && activePlaylist);
    const videoCategory = categorizeVideo(video);
    const normalizedVideoCategory = normalizeText(video.category);
    const isKnownCategory = isRecognizedVideoCategoryValue(normalizedVideoCategory);
    const currentCategorySelection: VideoCategorySelection = isKnownCategory
      ? (normalizedVideoCategory as VideoCategorySelection)
      : '';
    const customCategoryLabel = !isKnownCategory && normalizedVideoCategory.length > 0
      ? (video.category ?? '').trim() || normalizedVideoCategory
      : null;
    const categorySelectValue: VideoCategorySelection | typeof VIDEO_CATEGORY_CUSTOM_VALUE = customCategoryLabel
      ? VIDEO_CATEGORY_CUSTOM_VALUE
      : currentCategorySelection;
    const categoryStatus = videoCategoryStatusMap[video.id];
    const categorySelectId = `video-category-${video.id}`;
    const videoThumbnail =
      video.thumbnailUrl ||
      (video.youtubeVideoId ? `https://img.youtube.com/vi/${video.youtubeVideoId}/hqdefault.jpg` : null);
    const rawVideoTitle = video.title || video.youtubeVideoId || '제목 없는 영상';
    const videoTitle =
      videoCategory === 'live'
        ? rawVideoTitle
        : formatSongTitle(video.title, { fallback: rawVideoTitle });
    const videoOriginalComposer =
      typeof video.originalComposer === 'string' ? video.originalComposer.trim() : '';
    const videoArtistName = (video.artistDisplayName ?? video.artistName ?? '').trim();
    const videoTagValues = buildTagList(
      videoOriginalComposer ? `원곡:${videoOriginalComposer}` : null,
      videoCategory !== 'live' && videoArtistName ? `보컬:${videoArtistName}` : null
    );
    const metadataDraft = videoMetadataDraftMap[video.id];
    const metadataStatus = videoMetadataStatusMap[video.id];
    const isEditingMetadata = Boolean(metadataDraft);
    const metadataSaving = metadataStatus?.state === 'saving';

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
            <div className="artist-library__video-thumbnail artist-library__video-thumbnail--placeholder" aria-hidden="true">
              <span>썸네일 없음</span>
            </div>
          )}
          <div className="artist-library__video-meta">
            <span className="artist-library__video-title">{videoTitle}</span>
            <span className="artist-library__video-subtitle">
              {formatVideoMetaSummary(video)}
            </span>
            {videoTagValues.length > 0 && (
              <div className="artist-library__clip-tags">
                {videoTagValues.map((tag) => (
                  <span key={tag} className="tag">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
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
                }${!canModifyPlaylist ? ' is-disabled' : ''}`}
                aria-pressed={isVideoQueued}
                aria-label={isVideoQueued ? '재생목록에서 제거' : '재생목록에 추가'}
                aria-disabled={!canModifyPlaylist}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  void handleVideoPlaylistToggle(video.id);
                }}
              >
                {isVideoQueued ? '재생목록 추가됨' : '재생목록에 추가'}
              </button>
            </div>
            <div
              className="artist-library__video-metadata"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              {isEditingMetadata ? (
                <form
                  className="video-metadata-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void handleVideoMetadataSubmit(video);
                  }}
                >
                  <div className="video-metadata-form__fields">
                    <div className="video-metadata-form__field">
                      <label htmlFor={`video-metadata-title-${video.id}`}>제목</label>
                      <input
                        id={`video-metadata-title-${video.id}`}
                        type="text"
                        value={metadataDraft.title}
                        onChange={handleVideoMetadataFieldChange(video.id, 'title')}
                        disabled={metadataSaving}
                      />
                    </div>
                    <div className="video-metadata-form__field">
                      <label htmlFor={`video-metadata-composer-${video.id}`}>원곡자</label>
                      <input
                        id={`video-metadata-composer-${video.id}`}
                        type="text"
                        value={metadataDraft.originalComposer}
                        onChange={handleVideoMetadataFieldChange(video.id, 'originalComposer')}
                        disabled={metadataSaving}
                      />
                    </div>
                  </div>
                  {metadataStatus?.state === 'saving' && (
                    <p className="video-metadata-status" role="status">
                      저장 중...
                    </p>
                  )}
                  {metadataStatus?.state === 'success' && (
                    <p className="video-metadata-status video-metadata-status--success" role="status">
                      {metadataStatus.message}
                    </p>
                  )}
                  {metadataStatus?.state === 'error' && (
                    <p className="video-metadata-status video-metadata-status--error" role="alert">
                      {metadataStatus.message}
                    </p>
                  )}
                  {metadataStatus?.state === 'info' && (
                    <p className="video-metadata-status" role="status">
                      {metadataStatus.message}
                    </p>
                  )}
                  <div className="video-metadata-form__actions">
                    <button type="submit" disabled={metadataSaving}>
                      저장
                    </button>
                    <button
                      type="button"
                      className="video-metadata-cancel"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        closeVideoMetadataEditor(video.id);
                      }}
                      disabled={metadataSaving}
                    >
                      취소
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  className={`artist-library__video-action artist-library__video-action--edit${
                    creationDisabled ? ' is-disabled' : ''
                  }`}
                  aria-disabled={creationDisabled}
                  disabled={creationDisabled}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    openVideoMetadataEditor(video);
                  }}
                >
                  메타데이터 수정
                </button>
              )}
            </div>
            <div
              className="artist-library__video-category-field"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <label htmlFor={categorySelectId}>분류 편집</label>
              <select
                id={categorySelectId}
                className="artist-library__video-category-select"
                value={categorySelectValue}
                onChange={(event) => {
                  const { value } = event.target;
                  if (value === VIDEO_CATEGORY_CUSTOM_VALUE) {
                    return;
                  }
                  const nextValue = value as VideoCategorySelection;
                  if (nextValue === currentCategorySelection) {
                    return;
                  }
                  void updateVideoCategory(video.id, nextValue);
                }}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
                disabled={creationDisabled || categoryStatus?.state === 'saving'}
              >
                {VIDEO_CATEGORY_OPTIONS.map(({ value, label }) => (
                  <option key={value || 'auto'} value={value}>
                    {label}
                  </option>
                ))}
                {customCategoryLabel && (
                  <option value={VIDEO_CATEGORY_CUSTOM_VALUE} disabled>
                    기타 ({customCategoryLabel})
                  </option>
                )}
              </select>
              {categoryStatus?.state === 'saving' && (
                <span className="artist-library__video-category-status" role="status">
                  저장 중...
                </span>
              )}
              {categoryStatus?.state === 'success' && (
                <span
                  className="artist-library__video-category-status artist-library__video-category-status--success"
                  role="status"
                >
                  {categoryStatus.message}
                </span>
              )}
              {categoryStatus?.state === 'error' && (
                <span
                  className="artist-library__video-category-status artist-library__video-category-status--error"
                  role="alert"
                >
                  {categoryStatus.message}
                </span>
              )}
            </div>
          </div>
        </div>
      </li>
    );
  };

  const sidebarTabs = useMemo(() => {
    const tabs: {
      id: SectionKey;
      label: string;
      description: string;
      icon: JSX.Element;
    }[] = [
      {
        id: 'latest',
        label: translate('nav.latest.label'),
        description: translate('nav.latest.description'),
        icon: <HomeIcon />
      },
      {
        id: 'catalog',
        label: translate('nav.catalog.label'),
        description: translate('nav.catalog.description'),
        icon: <SearchIcon />
      },
      {
        id: 'library',
        label: translate('nav.library.label'),
        description: translate('nav.library.description'),
        icon: <LibraryIcon />
      },
      {
        id: 'live',
        label: translate('nav.live.label'),
        description: translate('nav.live.description'),
        icon: <LiveIcon />
      }
    ];

    return tabs;
  }, [translate]);

  const mobileArtistTabs = useMemo(
    () => sidebarTabs.filter((tab) => tab.id === 'library' || tab.id === 'catalog'),
    [sidebarTabs]
  );

  const activeSidebarTab = sidebarTabs.find((tab) => tab.id === activeSection) ?? sidebarTabs[0];

  const liveWidgetEntries = useMemo(() => {
    const entries: { key: string; artistName: string; title: string }[] = [];

    liveArtists.forEach((entry) => {
      const artistName = (entry.artist.displayName || entry.artist.name || '').trim() || '라이브';

      entry.liveVideos.forEach((video, index) => {
        const title = (video.title || '라이브 방송').trim() || '라이브 방송';
        const key = `${entry.artist.id}-${video.videoId ?? index}`;
        if (!entries.some((item) => item.key === key)) {
          entries.push({ key, artistName, title });
        }
      });
    });

    return entries.slice(0, 5);
  }, [liveArtists]);

  const mobileAuthOverlayLabel = isAuthenticated
    ? translate('mobile.auth.overlayLabelAuthenticated')
    : translate('mobile.auth.overlayLabelGuest');
  const mobileAuthTriggerLabel = isAuthenticated
    ? translate('mobile.actions.authOpenAuthenticated')
    : translate('mobile.actions.authOpenGuest');

  const previousAuthRef = useRef(isAuthenticated);

  useEffect(() => {
    if (!previousAuthRef.current && isAuthenticated) {
      navigateToSection('library');
    }
    previousAuthRef.current = isAuthenticated;
  }, [isAuthenticated, navigateToSection]);


  const fallbackDisplayName =
    typeof currentUser?.displayName === 'string' ? currentUser.displayName.trim() : '';
  const greetingName = (fallbackDisplayName || nicknameInput).trim();
  const greetingMessage = greetingName
    ? `${greetingName} 님, 환영합니다!`
    : '닉네임을 설정해주세요.';

  const artistOptionalFields = (
    <>
      <div className="artist-registration__field-grid">
        <div className="artist-registration__field">
          <label htmlFor="artistTags">아티스트 태그</label>
          <div className="chip-input">
            <div className="chip-input__list" aria-live="polite">
              {artistForm.tags.map((tag) => (
                <span key={tag} className="chip-input__chip">
                  <span className="chip-input__chip-label">{tag}</span>
                  <button
                    type="button"
                    className="chip-input__remove"
                    onClick={() => handleArtistTagRemove(tag)}
                    aria-label={`${tag} 태그 제거`}
                    disabled={creationDisabled}
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                id="artistTags"
                className="chip-input__input"
                placeholder="예: 라이브, 커버"
                value={artistForm.tagInput}
                onChange={(event) => handleArtistTagInputChange(event.target.value)}
                onKeyDown={handleArtistTagKeyDown}
                onBlur={commitArtistTagInput}
                disabled={creationDisabled}
              />
            </div>
          </div>
          <p className="form-hint">Enter 또는 콤마(,)로 태그를 추가하세요.</p>
        </div>
        <div className="artist-registration__field">
          <label htmlFor="artistAgency">소속사</label>
          <input
            id="artistAgency"
            placeholder="소속사 이름"
            value={artistForm.agency}
            onChange={(event) => setArtistForm((prev) => ({ ...prev, agency: event.target.value }))}
            disabled={creationDisabled}
          />
        </div>
        <div className="artist-registration__field">
          <label htmlFor="artistChzzkChannelId">치지직 채널 ID (선택)</label>
          <input
            id="artistChzzkChannelId"
            placeholder="예: 80c2..."
            value={artistForm.chzzkChannelId}
            onChange={(event) =>
              setArtistForm((prev) => ({ ...prev, chzzkChannelId: event.target.value }))
            }
            disabled={creationDisabled}
          />
          <p className="form-hint">URL 전체가 아닌 채널 ID만 입력하세요.</p>
        </div>
      </div>
      <fieldset className="artist-registration__countries">
        <legend>서비스 국가</legend>
        <p className="artist-registration__countries-hint">복수 선택 가능</p>
        <div className="artist-registration__country-options">
          {ARTIST_FORM_COUNTRIES.map((country) => {
            const isSelected = artistForm.countries[country.key];
            return (
              <button
                key={country.code}
                type="button"
                className={`artist-country-toggle${
                  isSelected ? ' artist-country-toggle--active' : ''
                }`}
                aria-pressed={isSelected}
                onClick={() =>
                  setArtistForm((prev) => ({
                    ...prev,
                    countries: {
                      ...prev.countries,
                      [country.key]: !prev.countries[country.key]
                    }
                  }))
                }
                disabled={creationDisabled}
              >
                <span className="artist-country-toggle__code">{country.code}</span>
                <span className="artist-country-toggle__label">{country.label}</span>
              </button>
            );
          })}
        </div>
      </fieldset>
    </>
  );

  const artistPreviewBody = isArtistPreviewLoading ? (
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
        <div className="artist-preview__thumbnail artist-preview__thumbnail--placeholder">썸네일 없음</div>
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
    <p className="artist-preview__empty">채널 ID를 입력한 뒤 등록 버튼을 눌러 미리보기를 확인하세요.</p>
  );

  const artistDebugLogContent = useMemo(() => (
    <div className="artist-debug-log">
      {artistDebugLog.length === 0 ? (
        <p className="artist-debug-log__empty">최근 디버그 로그가 없습니다.</p>
      ) : (
        <ul className="artist-debug-log__list">
          {artistDebugLog.map((entry) => (
            <li key={entry.id} className="artist-debug-log__entry">
              <div className="artist-debug-log__entry-header">
                <span className="artist-debug-log__label">{formatDebugLabel(entry.type)}</span>
                <span className="artist-debug-log__timestamp">{formatTimestamp(entry.timestamp)}</span>
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
  ), [artistDebugLog, formatDebugLabel, formatTimestamp]);

  const showOptionalFields = !isMobileViewport || isArtistOptionalFieldsOpen;
  const optionalToggleLabel = isArtistOptionalFieldsOpen ? '추가 정보 숨기기' : '추가 정보 입력';
  const mobilePreviewSummary = (() => {
    if (isArtistPreviewLoading) {
      return '채널 확인 중...';
    }
    if (artistPreviewError) {
      return `오류: ${artistPreviewError}`;
    }
    if (artistPreviewReady && artistPreview) {
      const title = artistPreview.data.title?.trim();
      return title && title.length > 0 ? `${title} 확인 완료` : '채널 정보 확인 완료';
    }
    return '등록 버튼으로 채널을 확인하세요.';
  })();
  const mobileDebugSummary =
    artistDebugLog.length > 0 ? `${artistDebugLog.length}건의 로그` : '최근 로그 없음';
  const mobileOptionalPanelId = 'artistRegistrationOptional';
  const mobilePreviewPanelId = 'artistPreviewMobilePanel';
  const mobileDebugPanelId = 'artistDebugMobilePanel';
  const channelInputHint = useMemo(() => {
    const trimmed = artistForm.channelId.trim();
    if (!trimmed) {
      return '채널 URL, 핸들(@handle), 채널 ID(UC...) 모두 입력할 수 있어요.';
    }
    if (/^UC[a-zA-Z0-9_-]{21,}$/i.test(trimmed)) {
      return '유효한 채널 ID 형식입니다. 바로 조회해 볼게요.';
    }
    if (trimmed.startsWith('@')) {
      return '핸들을 감지했어요. 등록 시 채널 ID를 자동으로 찾아요.';
    }
    if (trimmed.includes('youtube.com')) {
      return 'URL에서 채널 ID를 추출해 등록합니다.';
    }
    return '형식을 다시 확인해 주세요. @핸들이나 UC로 시작하는 ID를 추천합니다.';
  }, [artistForm.channelId]);
  const playlistVisibilityDescription = (() => {
    switch (playlistDialogVisibility) {
      case 'PUBLIC':
        return '공개 재생목록으로 생성됩니다.';
      case 'UNLISTED':
        return '링크가 있는 사람만 볼 수 있도록 생성됩니다.';
      default:
        return '비공개 재생목록으로 생성됩니다.';
    }
  })();

  const rightSidebarContent = (
    <aside id="rightSidebarDrawer" className="right-sidebar" aria-label="보조 위젯">
      <div className="search-widget">
        <div className="search-input-group">
          <SearchIcon />
          <input
            type="search"
            value={artistSearch.query}
            onChange={(event) => handleArtistSearchQueryChange(event.target.value)}
            placeholder="아티스트 검색"
            aria-label="아티스트 검색"
          />
        </div>
      </div>

      <div className="widget-box">
        <h3>라이브</h3>
        {isLiveArtistsLoading ? (
          <p className="live-mini-item" aria-live="polite">
            방송 정보를 불러오는 중...
          </p>
        ) : liveWidgetEntries.length === 0 ? (
          <p className="live-mini-item" aria-live="polite">
            현재 진행 중인 라이브가 없습니다.
          </p>
        ) : (
          liveWidgetEntries.map((entry) => (
            <div key={entry.key} className="live-mini-item">
              <strong>{entry.artistName}</strong>
              <span>{entry.title}</span>
            </div>
          ))
        )}
      </div>

      <div className="widget-box playlist-widget">
        <div className="playlist-widget__header">
          <div>
            <h3>재생목록</h3>
            <p className="playlist-widget__subtitle">{playlistSubtitle}</p>
          </div>
        </div>
        <div className="playlist-widget__selector">
          <label className="playlist-selector__label" htmlFor="playlistWidgetSelector">
            {playlistSelectorLabel}
          </label>
          {availablePlaylists.length > 0 ? (
            <select
              id="playlistWidgetSelector"
              className="playlist-selector__dropdown"
              value={playlistSelectionValue}
              onChange={handlePlaylistSelectionChange}
            >
              {!activePlaylist && (
                <option value="" disabled>
                  재생목록을 선택하세요
                </option>
              )}
              {availablePlaylists.map((playlist) => {
                const trimmedTitle = playlist.title.trim();
                const optionLabel = trimmedTitle.length > 0 ? trimmedTitle : `재생목록 ${playlist.id}`;
                return (
                  <option key={playlist.id} value={playlist.id}>
                    {optionLabel}
                  </option>
                );
              })}
            </select>
          ) : (
            <div className="playlist-selector__empty" role="status" aria-live="polite">
              표시할 재생목록이 없습니다.
            </div>
          )}
        </div>
        <div className="playlist-widget__search">
          <label className="playlist-search__label" htmlFor="playlistWidgetSearch">
            검색
          </label>
          <div className="playlist-search__input">
            <SearchIcon />
            <input
              id="playlistWidgetSearch"
              type="search"
              value={playlistSearchQuery}
              onChange={(event) => setPlaylistSearchQuery(event.target.value)}
              placeholder="영상 또는 클립 검색"
              aria-label="영상 또는 클립 검색"
            />
          </div>
        </div>
        <div className="playlist-widget__entries">
          {!playlistHasResults ? (
            <p className="empty-state">{playlistEmptyMessage}</p>
          ) : (
            <PlaylistEntriesList
              entries={filteredPlaylistEntries}
              expandedPlaylistEntryId={expandedPlaylistEntryId}
              handlePlaylistEntryRemove={handlePlaylistEntryRemove}
              setExpandedPlaylistEntryId={setExpandedPlaylistEntryId}
              resolvePlaylistEntryKey={resolvePlaylistEntryKey}
              isRemovalDisabled={isPlaylistEntryRemovalDisabled}
            />
          )}
        </div>
      </div>
    </aside>
  );

  return (
    <>
      <div className="toast-stack" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast--${toast.tone}`} role="status">
            <span className="toast__message">{toast.message}</span>
            <button
              type="button"
              className="toast__dismiss"
              onClick={() => dismissToast(toast.id)}
              aria-label="알림 닫기"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {toastMessage && <div className="toast-message">{toastMessage}</div>}

      {isPlaylistDialogOpen && (
        <div className="playlist-dialog" role="dialog" aria-modal="true" aria-label="새 재생목록 만들기">
          <div
            className="playlist-dialog__backdrop"
            role="presentation"
            onClick={handlePlaylistDialogCancel}
          />
          <div className="playlist-dialog__content" role="document">
            <h3 className="playlist-dialog__title">새 재생목록 만들기</h3>
            <form className="playlist-dialog__form" onSubmit={handlePlaylistDialogSubmit}>
              <label className="playlist-dialog__field">
                <span className="playlist-dialog__label">재생목록 제목</span>
                <input
                  ref={playlistDialogInputRef}
                  type="text"
                  value={playlistTitleInput}
                  onChange={(event) => setPlaylistTitleInput(event.target.value)}
                  placeholder="예: 취침용 리스트"
                  required
                  autoComplete="off"
                />
              </label>
              <p className="playlist-dialog__hint">{playlistVisibilityDescription}</p>
              <div className="playlist-dialog__actions">
                <button
                  type="button"
                  className="playlist-dialog__button playlist-dialog__button--ghost"
                  onClick={handlePlaylistDialogCancel}
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="playlist-dialog__button playlist-dialog__button--primary"
                >
                  만들기
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className={`app-layout ${isMobileViewport ? 'mobile-layout' : 'desktop-layout'}`}>
        {!isMobileViewport && (
          <aside
            id="app-sidebar"
            className="sidebar sidebar-left"
            aria-label={translate('layout.sidebarNavLabel')}
          >
            <div className="sidebar__brand">
              <div className="sidebar__logo">
                <img src={utahubLogo} alt={translate('layout.logoAlt')} />
              </div>
              <div className="sidebar__brand-copy">
                <p className="sidebar__eyebrow">{translate('app.brand')}</p>
                <h1>{translate('app.title')}</h1>
              </div>
            </div>
            <nav className="sidebar__nav">
              {sidebarTabs.map((tab) => {
                const isActive = activeSection === tab.id;
                return (
                  <Link
                    key={tab.id}
                    id={`sidebar-tab-${tab.id}`}
                    className={`sidebar__tab${isActive ? ' active' : ''}`}
                    to={SECTION_PATHS[tab.id]}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <span className="sidebar__tab-icon">{tab.icon}</span>
                    <span className="sidebar__tab-text">
                      <span className="sidebar__tab-label">{tab.label}</span>
                      <span className="sidebar__tab-description">{tab.description}</span>
                    </span>
                  </Link>
                );
              })}
            </nav>
            <div className="sidebar__footer">
              <AuthPanel
                className="auth-panel--sidebar"
                isAuthenticated={isAuthenticated}
                greetingMessage={greetingMessage}
                isLoadingUser={isLoadingUser}
                nicknameInput={nicknameInput}
                onNicknameInputChange={(value) => setNicknameInput(value)}
                onNicknameSubmit={handleNicknameSubmit}
                nicknameStatus={nicknameStatus}
                nicknameError={nicknameError}
                onSignOut={handleSignOut}
                isGoogleReady={isGoogleReady}
                onGoogleCredential={handleGoogleCredential}
                shouldAutoPromptGoogle={shouldAutoPromptGoogle}
              />
              <p className="sidebar__contact">
                문의 및 오류 제보는{' '}
                <a href="https://x.com/utahuboffcial" target="_blank" rel="noopener noreferrer">
                  X의 @utahuboffcial
                </a>{' '}
                또는{' '}
                <a href="mailto:utahubcs@gmail.com">utahubcs@gmail.com</a>
                으로 부탁드립니다.
              </p>
            </div>
          </aside>
        )}

        {isMobileViewport && (
          <header className="mobile-header">
            <div className="mobile-logo-area">
              <img src={utahubLogo} alt={translate('layout.logoAlt')} className="mobile-logo" />
            </div>
            <div className="mobile-header-actions">
              <button type="button" className="icon-btn" aria-label="검색">
                🔍
              </button>
              <button
                type="button"
                className="icon-only-btn"
                aria-label={mobileAuthTriggerLabel}
                onClick={() => setMobileAuthOverlayOpen(true)}
              >
                <div className="avatar-circle" aria-hidden="true">
                  👤
                </div>
              </button>
            </div>
          </header>
        )}

        <main className="main-content">
          <div className="content-area">
            {!isMobileViewport && (
              <header className="content-header">
                <div className="content-header__body">
                  <div className="content-header__top-row">
                    <p className="content-header__eyebrow">{translate('header.eyebrow')}</p>
                    <LanguageToggle className="content-header__language-toggle" />
                  </div>
                  <h2>{activeSidebarTab.label}</h2>
                  <p className="content-header__description">{activeSidebarTab.description}</p>
                </div>
              </header>
            )}

            {isMobileViewport && isMobileAuthOverlayOpen && (
              <div className="mobile-auth-overlay">
                <div
                  className="mobile-auth-overlay__backdrop"
                  role="presentation"
                  onClick={() => setMobileAuthOverlayOpen(false)}
                />
                <div
                  className="mobile-auth-overlay__content"
                  role="dialog"
                  aria-modal="true"
                  aria-label={mobileAuthOverlayLabel}
                  id="mobileAuthDialog"
                  ref={mobileAuthOverlayContentRef}
                  tabIndex={-1}
                >
                  <button
                    type="button"
                    className="mobile-auth-overlay__close"
                    onClick={() => setMobileAuthOverlayOpen(false)}
                    aria-label={translate('mobile.auth.closeAriaLabel')}
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                  <AuthPanel
                    className="auth-panel--mobile"
                    isAuthenticated={isAuthenticated}
                    greetingMessage={greetingMessage}
                    isLoadingUser={isLoadingUser}
                    nicknameInput={nicknameInput}
                    onNicknameInputChange={(value) => setNicknameInput(value)}
                    onNicknameSubmit={handleNicknameSubmit}
                    nicknameStatus={nicknameStatus}
                    nicknameError={nicknameError}
                    onSignOut={handleSignOut}
                    isGoogleReady={isGoogleReady}
                    onGoogleCredential={handleGoogleCredential}
                    shouldAutoPromptGoogle={shouldAutoPromptGoogle}
                  />
                </div>
              </div>
            )}

            <div className="content-panels">
            <Routes>

            <Route
              path={SECTION_PATHS.latest}
              element={
                <section
                  className={`content-panel${activeSection === 'latest' ? ' active' : ''}`}
                  role="tabpanel"
                  aria-labelledby="sidebar-tab-latest"
                  hidden={activeSection !== 'latest'}
                >
          <div className="panel latest-panel">
              {/* ✅ [수정] 모바일에서만 내부 제목 표시 (PC는 상단 헤더 사용) */}
              {isMobileViewport && (
                <div className="latest-panel__header">
                  <h2>{translate('latest.panel.heading')}</h2>
                  <p>{translate('latest.panel.description')}</p>
                </div>
              )}
              <div className="latest-panel__grid">
                <article className="latest-block latest-block--videos">
                  <div className="latest-block__header">
                    <h3>{translate('latest.panel.videosHeading')}</h3>
                  </div>
                  {(latestPlaybackNotice || latestVideoPreviewMessage || currentPlaybackItem) && (
                    <div
                      className="latest-video-preview-region"
                      aria-live="polite"
                      ref={latestPreviewRegionRef}
                    >
                      <div
                        className="latest-video-preview"
                        role="dialog"
                        aria-modal="false"
                        aria-label={`${translate('latest.panel.previewAriaLabel')} · ${
                          latestPlaybackNotice ?? translate('latest.panel.heading')
                        }`}
                      >
                        <div className="latest-video-preview__header">
                          <div>
                            <h4 className="latest-video-preview__title">
                              {latestPlaybackNotice || translate('latest.panel.heading')}
                            </h4>
                            <p className="latest-video-preview__subtitle">
                              {latestPlaybackNotice
                                ? '하단 재생바에서 이어서 감상할 수 있어요.'
                                : translate('latest.panel.previewLoading')}
                            </p>
                          </div>
                          <button
                            type="button"
                            className="latest-video-preview__close"
                            onClick={handleLatestPreviewDismiss}
                            aria-label={translate('latest.panel.closePreviewAriaLabel')}
                          >
                            {translate('latest.panel.closePreview')}
                          </button>
                        </div>
                        {latestVideoPreviewMessage ? (
                          <p className="latest-video-preview__message" role="status">
                            {latestVideoPreviewMessage}
                          </p>
                        ) : currentPlaybackItem ? (
                          <div className="latest-video-preview__queue-status">
                            <p className="latest-video-preview__subtitle">지금 재생 중</p>
                            <p className="latest-video-preview__title">{currentPlaybackItem.title}</p>
                            {currentPlaybackItem.subtitle && (
                              <p className="latest-video-preview__subtitle">{currentPlaybackItem.subtitle}</p>
                            )}
                            <div className="latest-video-preview__actions" role="group" aria-label="재생 제어">
                              <button
                                type="button"
                                className="latest-video-preview__action"
                                onClick={handlePlaybackPrevious}
                              >
                                이전
                              </button>
                              <button
                                type="button"
                                className="latest-video-preview__action"
                                onClick={handlePlaybackToggle}
                              >
                                {isPlaybackActive ? '일시정지' : '재생'}
                              </button>
                              <button
                                type="button"
                                className="latest-video-preview__action"
                                onClick={handlePlaybackNext}
                              >
                                다음
                              </button>
                            </div>
                            <p className="latest-video-preview__message">
                              재생/반복 제어는 하단 재생바와 동일하게 적용돼요.
                            </p>
                          </div>
                        ) : (
                          <p className="latest-video-preview__message" role="status">
                            {translate('latest.panel.previewUnavailable')}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                  {latestVideos.length > 0 ? (
                    <ul className="latest-video-grid">
                      {latestVideos.map((video) => {
                        const videoThumbnail =
                          video.thumbnailUrl ||
                          (video.youtubeVideoId
                            ? `https://img.youtube.com/vi/${video.youtubeVideoId}/hqdefault.jpg`
                            : null);
                        const rawVideoTitle =
                          video.title ||
                          video.youtubeVideoId ||
                          translate('latest.panel.videoFallbackTitle');
                        const videoTitle =
                          formatSongTitle(video.title, { fallback: rawVideoTitle }) ||
                          translate('latest.panel.videoFallbackTitle');
                        const videoArtistName =
                          (
                            video.artistDisplayName ??
                            video.artistName ??
                            video.artistYoutubeChannelTitle ??
                            ''
                          ).trim() || translate('catalog.fallback.artist');
                        const metaSummary = formatVideoMetaSummary(video, { includeDuration: false });
                        const addedLabel =
                          typeof video.createdAt === 'string'
                            ? formatTimestamp(video.createdAt)
                            : null;
                        const youtubeUrl = video.youtubeVideoId
                          ? `https://www.youtube.com/watch?v=${video.youtubeVideoId}`
                          : null;
                        return (
                          <li key={`latest-video-${video.id}`} className="latest-video-card">
                            <button
                              type="button"
                              className="latest-video-card__main"
                              onClick={() => handleLatestVideoPlay(video, videoTitle, videoArtistName)}
                              aria-label={`${translate('latest.panel.viewInLibrary')} · ${videoTitle}`}
                            >
                              <div className="latest-video-card__thumbnail">
                                {videoThumbnail ? (
                                  <img
                                    src={videoThumbnail}
                                    alt={`${videoTitle} ${translate('latest.panel.thumbnailAltSuffix')}`}
                                    loading="lazy"
                                    decoding="async"
                                  />
                                ) : (
                                  <div
                                    className="latest-video-card__thumbnail-placeholder"
                                    aria-hidden="true"
                                  >
                                    {translate('latest.panel.thumbnailPlaceholder')}
                                  </div>
                                )}
                              </div>
                              <div className="latest-video-card__body">
                                <h4 className="latest-video-card__title">{videoTitle}</h4>
                                <div className="latest-video-card__meta">
                                  <span className="latest-video-card__artist">{videoArtistName}</span>
                                  {metaSummary && (
                                    <span className="latest-video-card__summary">{metaSummary}</span>
                                  )}
                                  {addedLabel && (
                                    <span className="latest-video-card__timestamp">
                                      {translate('latest.panel.addedAt')} {addedLabel}
                                    </span>
                                  )}
                                </div>
                                <span className="latest-video-card__cta">
                                  {translate('latest.panel.viewInLibrary')}
                                </span>
                              </div>
                            </button>
                            <div className="latest-video-card__actions">
                              {youtubeUrl ? (
                                <a
                                  className="latest-video-card__action latest-video-card__action--link"
                                  href={youtubeUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {translate('latest.panel.openOnYoutube')}
                                </a>
                              ) : (
                                <span className="latest-video-card__action latest-video-card__action--placeholder">
                                  {translate('latest.panel.openOnYoutube')}
                                </span>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="latest-empty" role="status">
                      {translate('latest.panel.videosEmpty')}
                    </p>
                  )}
                </article>
                <article className="latest-block latest-block--clips">
                  <div className="latest-block__header">
                    <h3>{translate('latest.panel.clipsHeading')}</h3>
                  </div>
                  {latestClipEntries.length > 0 ? (
                    <ul className="latest-clip-list">
                      {latestClipEntries.map(({ clip, parentVideo }) => {
                        const clipThumbnail =
                          clip.thumbnailUrl ||
                          (clip.youtubeVideoId
                            ? `https://img.youtube.com/vi/${clip.youtubeVideoId}/hqdefault.jpg`
                            : null);
                        const rawClipTitle =
                          clip.title ||
                          clip.sectionTitle ||
                          clip.youtubeChapterTitle ||
                          clip.description ||
                          clip.youtubeVideoId ||
                          clip.videoTitle ||
                          translate('catalog.fallback.clip');
                        const clipTitle =
                          formatSongTitle(clip.title, { tags: clip.tags, fallback: rawClipTitle }) ||
                          translate('catalog.fallback.clip');
                        const clipArtistName =
                          (
                            clip.artistDisplayName ??
                            clip.artistName ??
                            parentVideo?.artistDisplayName ??
                            parentVideo?.artistName ??
                            parentVideo?.artistYoutubeChannelTitle ??
                            ''
                          ).trim() || translate('catalog.fallback.artist');
                        return (
                          <li key={`latest-clip-${clip.id}`} className="latest-clip">
                            <button
                              type="button"
                              className="latest-clip__main"
                              onClick={() => handleLatestClipPlay(clip, parentVideo, clipTitle, clipArtistName)}
                              aria-label={`${translate('latest.panel.openInLibrary')} · ${clipTitle}`}
                            >
                              <div className="latest-clip__media">
                                {clipThumbnail ? (
                                  <img
                                    src={clipThumbnail}
                                    alt={`${clipTitle} ${translate('latest.panel.thumbnailAltSuffix')}`}
                                    loading="lazy"
                                    decoding="async"
                                  />
                                ) : (
                                  <div
                                    className="latest-clip__thumbnail latest-clip__thumbnail--placeholder"
                                    aria-hidden="true"
                                  >
                                    {translate('latest.panel.thumbnailPlaceholder')}
                                  </div>
                                )}
                              </div>
                              <div className="latest-clip__body">
                                <h4 className="latest-clip__title">{clipTitle}</h4>
                                <p className="latest-clip__artist">{clipArtistName}</p>
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="latest-empty" role="status">
                      {translate('latest.panel.clipsEmpty')}
                    </p>
                )}
              </article>
            </div>
          </div>
          </section>
              }
            />

            <Route
              path={SECTION_PATHS.live}
              element={
          <section
            className={`content-panel${activeSection === 'live' ? ' active' : ''}`}
            role="tabpanel"
            aria-labelledby="sidebar-tab-live"
            hidden={activeSection !== 'live'}
          >
            <div className="panel live-panel">
              {/* ✅ [수정] 모바일에서만 내부 제목 표시 */}
              {isMobileViewport && (
                <div className="live-panel__header">
                  <h2>{translate('live.panel.heading')}</h2>
                  <p>{translate('live.panel.description')}</p>
                </div>
              )}
              <div className="live-panel__content" aria-live="polite">
                {isLiveArtistsLoading ? (
                  /* ✅ [개선] 라이브 패널 스켈레톤 로딩 UI */
                  <ul className="live-panel__list">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <li key={`skeleton-live-${i}`} className="live-panel__item">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                          <div className="skeleton" style={{ width: '48px', height: '48px', borderRadius: '50%' }} />
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div className="skeleton skeleton--text" style={{ width: '120px' }} />
                            <div className="skeleton skeleton--text" style={{ width: '80px', height: '12px' }} />
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                          <div className="skeleton" style={{ width: '100%', paddingTop: '56.25%', borderRadius: '10px' }} />
                          <div
                            className="skeleton live-panel__video-skeleton--desktop"
                            style={{ width: '100%', paddingTop: '56.25%', borderRadius: '10px' }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : liveArtistsError ? (
                  <div className="live-panel__error" role="alert">
                    <p>{liveArtistsError}</p>
                    <button
                      type="button"
                      className="live-panel__retry"
                      onClick={handleLiveArtistsRetry}
                      disabled={isLiveArtistsLoading}
                    >
                      {translate('live.panel.retry')}
                    </button>
                  </div>
                ) : liveArtistEntries.length === 0 ? (
                  <p className="live-panel__status">{translate('live.panel.empty')}</p>
                ) : (
                  <ul className="live-panel__list">
                    {liveArtistEntries.map(({ artist, liveVideos }) => (
                      <li key={`live-artist-${artist.id}`} className="live-panel__item">
                        <div className="live-panel__artist">
                          <ArtistLibraryCard
                            artist={artist}
                            cardData={artist.cardData}
                            interactive={false}
                            showTags={false}
                          />
                        </div>
                        <ul className="live-panel__videos">
                          {liveVideos.map((video) => {
                            const title =
                              (video.title && video.title.trim().length > 0
                                ? video.title.trim()
                                : translate('live.panel.untitledStream')) || translate('live.panel.untitledStream');
                            const timeLabel = video.startedAt
                              ? `${translate('live.panel.startedLabel')} ${formatTimestamp(video.startedAt)}`
                              : video.scheduledStartAt
                              ? `${translate('live.panel.scheduledLabel')} ${formatTimestamp(video.scheduledStartAt)}`
                              : translate('live.panel.noTiming');
                            const videoUrl =
                              video.url && video.url.trim().length > 0
                                ? video.url
                                : `https://www.youtube.com/watch?v=${video.videoId}`;
                            return (
                              <li key={`live-video-${artist.id}-${video.videoId}`} className="live-panel__video">
                                <div className="live-panel__video-thumb">
                                  {video.thumbnailUrl ? (
                                    <img
                                      src={video.thumbnailUrl}
                                      alt={`${title} ${translate('latest.panel.thumbnailAltSuffix')}`}
                                      loading="lazy"
                                      decoding="async"
                                    />
                                  ) : (
                                    <div className="live-panel__video-thumb-placeholder" aria-hidden="true">
                                      {translate('latest.panel.thumbnailPlaceholder')}
                                    </div>
                                  )}
                                </div>
                                <div className="live-panel__video-body">
                                  <h4 className="live-panel__video-title">{title}</h4>
                                  <p className="live-panel__video-time">{timeLabel}</p>
                                  <a className="live-panel__video-link" href={videoUrl} target="_blank" rel="noreferrer">
                                    {translate('live.panel.watch')}
                                  </a>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
              }
            />

            <Route
              path={SECTION_PATHS.library}
              element={
          <section
            className={`content-panel${activeSection === 'library' ? ' active' : ''}`}
            role="tabpanel"
            aria-labelledby="sidebar-tab-library"
            hidden={activeSection !== 'library'}
          >
            <div className="panel media-panel">
              <div className={`artist-library${isMobileViewport ? ' artist-library--mobile' : ''}`}>

                {(() => {
                  const mainContent = (
                    <>
                    {isMobileViewport && !isArtistRegistrationOpen && (
                      <button
                        type="button"
                        className="artist-library__fab"
                        onClick={openArtistRegistration}
                        aria-label="아티스트 등록"
                      >
                        <span aria-hidden="true">+</span>
                      </button>
                    )}
                    {!isArtistRegistrationOpen && !isLibraryMediaFormOpen && (
                      <section className="magic-input">
                        <VideoLinkInput
                          id="magicInputUrl"
                          label="YouTube 링크 붙여넣기"
                          placeholder="YouTube 링크 붙여넣기"
                          value={videoForm.url}
                          onChange={handleMediaUrlChange}
                          onSubmit={handleMagicInputSubmit}
                          submitLabel={isResolvingVideoChannel ? '분석 중...' : '링크로 이동'}
                          submitButtonType="submit"
                          isSubmitting={isResolvingVideoChannel}
                          disabled={creationDisabled && !isAuthenticated}
                          existingVideoIds={libraryVideos.map((video) => video.youtubeVideoId)}
                          helperText={magicInputMessage || videoChannelResolutionError}
                          helperTone={
                            videoChannelResolutionError ? 'error' : magicInputMessage ? 'success' : 'info'
                          }
                        />
                      </section>
                    )}
                    {isArtistRegistrationOpen && (
                      <section className="artist-library__detail-section artist-library__form-section">
                        <div className="artist-library__section-header">
                          <h4>아티스트 등록</h4>
                          <button
                            type="button"
                            className="artist-library__action-button artist-library__action-button--secondary"
                            onClick={() => setArtistRegistrationOpen(false)}
                          >
                            닫기
                          </button>
                        </div>
                        <div
                          className={`artist-registration${isMobileViewport ? ' artist-registration--mobile' : ''}`}
                        >
                          <form
                            onSubmit={handleArtistSubmit}
                            className={`stacked-form artist-registration__form${
                              isMobileViewport ? ' artist-registration__form--mobile' : ''
                            }`}
                          >
                            <div className="artist-registration__section artist-registration__section--required">
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
                              <p className="form-hint" role="status">{channelInputHint}</p>
                            </div>
                            {isMobileViewport && (
                              <button
                                type="button"
                                className="artist-registration__toggle"
                                onClick={() => setArtistOptionalFieldsOpen((prev) => !prev)}
                                aria-expanded={isArtistOptionalFieldsOpen}
                                aria-controls={mobileOptionalPanelId}
                              >
                                {optionalToggleLabel}
                              </button>
                            )}
                            <div
                              className="artist-registration__section artist-registration__section--optional"
                              id={isMobileViewport ? mobileOptionalPanelId : undefined}
                              hidden={isMobileViewport && !showOptionalFields}
                              aria-hidden={isMobileViewport && !showOptionalFields ? true : undefined}
                            >
                              {artistOptionalFields}
                            </div>
                            <button
                              type="submit"
                              disabled={creationDisabled || isArtistPreviewLoading}
                            >
                              {isArtistPreviewLoading ? '채널 확인 중...' : artistSubmitLabel}
                            </button>
                            {creationDisabled && (
                              <p className="artist-preview__hint">로그인 후 아티스트를 등록할 수 있습니다.</p>
                            )}
                            {artistPreviewError && (
                              <p className="artist-preview__error" role="alert">
                                {artistPreviewError}
                              </p>
                            )}
                            {artistPreviewReady && artistPreview && (
                              <p className="artist-preview__hint">채널 정보를 확인하셨다면 다시 등록 버튼을 눌러 완료하세요.</p>
                            )}
                          </form>
                          {isMobileViewport ? (
                            <div className="artist-registration__mobile-panels">
                              <section
                                className={`artist-preview-card${isMobileArtistPreviewOpen ? ' is-open' : ''}`}
                              >
                                <button
                                  type="button"
                                  className="artist-preview-card__header"
                                  onClick={() => setMobileArtistPreviewOpen((prev) => !prev)}
                                  aria-expanded={isMobileArtistPreviewOpen}
                                  aria-controls={mobilePreviewPanelId}
                                >
                                  <div className="artist-preview-card__text">
                                    <span className="artist-preview-card__title">채널 미리보기</span>
                                    <span className="artist-preview-card__summary">{mobilePreviewSummary}</span>
                                  </div>
                                  <span className="artist-preview-card__chevron" aria-hidden="true" />
                                </button>
                                {isMobileArtistPreviewOpen && (
                                  <div
                                    className="artist-preview-card__body"
                                    id={mobilePreviewPanelId}
                                    aria-live="polite"
                                  >
                                    {artistPreviewBody}
                                  </div>
                                )}
                              </section>
                              <section
                                className={`artist-preview-card artist-preview-card--debug${
                                  isMobileArtistDebugOpen ? ' is-open' : ''
                                }`}
                              >
                                <button
                                  type="button"
                                  className="artist-preview-card__header"
                                  onClick={() =>
                                    setMobileArtistDebugOpen((prev) => {
                                      const next = !prev;
                                      setArtistDebugVisible(next);
                                      return next;
                                    })
                                  }
                                  aria-expanded={isMobileArtistDebugOpen}
                                  aria-controls={mobileDebugPanelId}
                                >
                                  <div className="artist-preview-card__text">
                                    <span className="artist-preview-card__title">디버그 로그</span>
                                    <span className="artist-preview-card__summary">{mobileDebugSummary}</span>
                                  </div>
                                  <span className="artist-preview-card__chevron" aria-hidden="true" />
                                </button>
                                {isMobileArtistDebugOpen && (
                                  <div className="artist-preview-card__body" id={mobileDebugPanelId}>
                                    {artistDebugLogContent}
                                  </div>
                                )}
                              </section>
                            </div>
                          ) : (
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
                              <div className="artist-preview-panel__body">{artistPreviewBody}</div>
                              {isArtistDebugVisible && artistDebugLogContent}
                            </aside>
                          )}
                        </div>
                      </section>
                    )}
                    {selectedArtist && (
                      <div className="artist-library__selection">
                        <span>{translate('artistDirectory.selectedLabel')}</span>
                        <strong>{selectedArtist.displayName || selectedArtist.name}</strong>
                      </div>
                    )}
                    <div className="artist-library__controls">
                      {isMobileViewport && (
                        <div className="artist-directory__search-group">
                          <ArtistSearchControls
                            query={artistSearch.query}
                            mode={artistSearch.mode}
                            onQueryChange={handleArtistSearchQueryChange}
                            onModeChange={handleArtistSearchModeChange}
                            onClear={handleArtistSearchClear}
                          />
                        </div>
                      )}
                      <div className="artist-directory__filter-group">
                        <div className="artist-directory__filter">
                          <label htmlFor="artistCountryFilter">
                            {translate('artistDirectory.filters.countryLabel')}
                          </label>
                          <select
                            id="artistCountryFilter"
                            value={artistCountryFilter}
                            onChange={(event) =>
                              setArtistCountryFilter(event.target.value as 'all' | ArtistCountryKey)
                            }
                          >
                            <option value="all">{translate('artistDirectory.filters.countryAll')}</option>
                            {ARTIST_COUNTRY_METADATA.map((country) => (
                              <option key={country.key} value={country.key}>
                                {country.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="artist-directory__filter">
                          <label htmlFor="artistAgencyFilter">
                            {translate('artistDirectory.filters.agencyLabel')}
                          </label>
                          <select
                            id="artistAgencyFilter"
                            value={artistAgencyFilter}
                            onChange={(event) => setArtistAgencyFilter(event.target.value)}
                          >
                            <option value="all">{translate('artistDirectory.filters.agencyAll')}</option>
                            {artistAgencies.map((agency) => (
                              <option key={agency} value={agency}>
                                {agency}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                    <div className="artist-library__link-panel">
                      <form className="artist-library__link-form" onSubmit={handleVideoChannelResolveSubmit}>
                        <label htmlFor="libraryMediaUrl">YouTube URL</label>
                        <div className="artist-library__link-input">
                          <input
                            id="libraryMediaUrl"
                            placeholder="https://www.youtube.com/watch?v=..."
                            value={videoForm.url}
                            onChange={(event) => handleMediaUrlChange(event.target.value)}
                            disabled={creationDisabled}
                          />
                          <button
                            type="submit"
                            disabled={creationDisabled || isResolvingVideoChannel}
                          >
                            {isResolvingVideoChannel ? '확인 중...' : '채널 확인'}
                          </button>
                        </div>
                        <p className="form-hint">
                          YouTube URL에 live가 포함되면 자동으로 클립 등록으로 전환됩니다.
                        </p>
                        {videoChannelResolutionError && (
                          <p className="form-hint form-hint--error" role="alert">
                            {videoChannelResolutionError}
                          </p>
                        )}
                        {videoChannelResolution && (
                          <p
                            className={`form-hint${
                              videoChannelResolution.artist ? ' form-hint--success' : ''
                            }`}
                            role="status"
                          >
                            {videoChannelResolution.channelTitle || videoChannelResolution.channelId
                              ? `${videoChannelResolution.channelTitle || videoChannelResolution.channelId} 채널을 확인했습니다.`
                              : '채널 정보를 확인했습니다.'}{' '}
                            {videoChannelResolution.artist
                              ? `${
                                  videoChannelResolution.artist.displayName ||
                                  videoChannelResolution.artist.name
                                } 아티스트가 자동으로 선택되었습니다.`
                              : '등록된 아티스트를 찾지 못했습니다. 목록에서 선택하거나 새로 등록해 주세요.'}
                          </p>
                        )}
                      </form>
                    </div>
                    {noArtistsRegistered ? (
                      <div className="artist-empty">{translate('artistDirectory.empty')}</div>
                    ) : selectedArtist ? (
                      <div className="artist-library__split-view">
                        <div className="artist-library__focused-panel">
                          <button type="button" className="artist-library__back-button" onClick={handleArtistClear}>
                            {translate('artistDirectory.back')}
                          </button>
                          <ArtistLibraryCard
                            artist={selectedArtist}
                            isActive
                            focusMode
                            interactive={false}
                            cardData={selectedArtist.cardData}
                            showTags
                          />
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
                            <button
                              type="button"
                              className="artist-library__action-button artist-library__action-button--ghost"
                              onClick={handleShowVideoList}
                            >
                              영상 목록
                            </button>
                            <button
                              type="button"
                              className="artist-library__action-button artist-library__action-button--ghost"
                              onClick={handleShowClipList}
                            >
                              클립 목록
                            </button>
                            {creationDisabled && (
                              <span className="artist-library__action-hint">로그인 후 등록할 수 있습니다.</span>
                            )}
                          </div>
                          <section className="artist-library__detail-section">
                            <div className="artist-library__section-header">
                              <h4>아티스트 정보</h4>
                              <span className="artist-library__status">
                                {isArtistProfileSaving ? '저장 중...' : '소속사와 태그를 관리하세요.'}
                              </span>
                            </div>
                            <form
                              onSubmit={handleArtistProfileSubmit}
                              className="stacked-form artist-library__form"
                            >
                              <label htmlFor="artistDetailAgency">소속사</label>
                              <input
                                id="artistDetailAgency"
                                placeholder="소속사를 입력하세요"
                                value={artistProfileForm.agency}
                                onChange={(event) => {
                                  setArtistProfileForm((prev) => ({
                                    ...prev,
                                    agency: event.target.value
                                  }));
                                  setArtistProfileStatus(null);
                                }}
                                disabled={creationDisabled || isArtistProfileSaving}
                              />
                              <label htmlFor="artistDetailTags">태그 (쉼표로 구분)</label>
                              <input
                                id="artistDetailTags"
                                placeholder="예: 라이브, 커버"
                                value={artistProfileForm.tags}
                                onChange={(event) => {
                                  setArtistProfileForm((prev) => ({
                                    ...prev,
                                    tags: event.target.value
                                  }));
                                  setArtistProfileStatus(null);
                                }}
                                disabled={creationDisabled || isArtistProfileSaving}
                              />
                              <p className="form-hint">쉼표로 구분해 태그를 입력하세요.</p>
                              {artistProfileTags.length > 0 && (
                                <div className="artist-library__tags">
                                  {artistProfileTags.map((tag) => (
                                    <button
                                      key={tag}
                                      type="button"
                                      className="artist-tag artist-tag--removable"
                                      onClick={() => handleArtistProfileTagRemove(tag)}
                                      aria-label={`태그 ${tag} 제거`}
                                    >
                                      {tag}
                                    </button>
                                  ))}
                                </div>
                              )}
                              {artistProfileStatus && (
                                <p
                                  className={`login-status__message${
                                    artistProfileStatus.type === 'error' ? ' error' : ''
                                  }`}
                                  role={artistProfileStatus.type === 'error' ? 'alert' : 'status'}
                                >
                                  {artistProfileStatus.message}
                                </p>
                              )}
                              <div className="artist-library__form-actions">
                                <button
                                  type="submit"
                                  disabled={creationDisabled || isArtistProfileSaving}
                                >
                                  {isArtistProfileSaving ? '저장 중...' : '정보 저장'}
                                </button>
                                <button
                                  type="button"
                                  onClick={handleArtistProfileReset}
                                  disabled={isArtistProfileSaving || !selectedArtist}
                                >
                                  되돌리기
                                </button>
                              </div>
                              {creationDisabled && (
                                <p className="form-hint">로그인 후 수정할 수 있습니다.</p>
                              )}
                            </form>
                          </section>
                          {isLibraryMediaFormOpen && selectedArtist && (
                            <section className="artist-library__detail-section artist-library__form-section">
                              <div className="artist-library__section-header">
                                <h4>영상 등록</h4>
                                <span className="artist-library__status">
                                  {isClipRegistration
                                    ? selectedVideoData
                                      ? selectedVideoData.title || selectedVideoData.youtubeVideoId
                                      : '등록할 영상을 선택하세요.'
                                    : selectedArtist.displayName || selectedArtist.name}
                                </span>
                              </div>
                              <form onSubmit={handleMediaSubmit} className="stacked-form artist-library__form">
                                <VideoLinkInput
                                  asForm={false}
                                  id="libraryMediaUrl"
                                  label={isClipRegistration ? '라이브 영상 URL' : '영상 URL'}
                                  placeholder="https://www.youtube.com/watch?v=..."
                                  value={videoForm.url}
                                  onChange={handleMediaUrlChange}
                                  existingVideoIds={libraryVideos.map((video) => video.youtubeVideoId)}
                                  disabled={creationDisabled}
                                  showSubmitButton={false}
                                  helperText="링크를 붙여넣으면 썸네일과 상태를 즉시 확인할 수 있습니다."
                                />
                                {videoSubmissionStatus && (
                                  <p
                                    className={`login-status__message${
                                      videoSubmissionStatus.type === 'error' ? ' error' : ''
                                    }`}
                                    role={videoSubmissionStatus.type === 'error' ? 'alert' : 'status'}
                                    aria-live="polite"
                                  >
                                    {videoSubmissionStatus.message}
                                  </p>
                                )}
                                {!isClipRegistration && (
                                  <>
                                    <label htmlFor="libraryVideoOriginalComposer">원곡자</label>
                                    <input
                                      id="libraryVideoOriginalComposer"
                                      placeholder="예: 원곡 또는 작곡가"
                                      value={videoForm.originalComposer}
                                      onChange={(event) =>
                                        setVideoForm((prev) => ({
                                          ...prev,
                                          originalComposer: event.target.value
                                        }))
                                      }
                                      disabled={creationDisabled}
                                    />
                                  </>
                                )}
                                <label>영상 분류</label>
                                <div className="category-selector">
                                  {VIDEO_CATEGORY_OPTIONS.filter((option) => option.value !== '').map((option) => (
                                    <button
                                      key={option.value}
                                      type="button"
                                      className={`category-option${
                                        videoForm.category === option.value ? ' active' : ''
                                      }`}
                                      onClick={() => {
                                        const nextCategory =
                                          videoForm.category === option.value ? '' : (option.value as VideoCategorySelection);
                                        setVideoForm((prev) => ({ ...prev, category: nextCategory }));
                                      }}
                                      disabled={creationDisabled}
                                    >
                                      {option.label}
                                    </button>
                                  ))}
                                </div>
                                <p className="form-hint">선택하지 않으면 제목을 기준으로 자동 분류합니다.</p>
                                {!isClipRegistration && (
                                  <p className="artist-preview__hint">
                                    영상 등록을 완료하면 아래 <strong>자동 감지된 클립 제안</strong>에서 추천 구간을 확인할 수 있습니다.
                                  </p>
                                )}
                                {showClipFields && (
                                  <>
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
                                                  {formatVideoMetaSummary(video, { includeDuration: false })}
                                                </option>
                                              ))}
                                            </optgroup>
                                          )}
                                          {officialVideos.length > 0 && (
                                            <optgroup label="공식 영상">
                                              {officialVideos.map((video) => (
                                                <option key={video.id} value={video.id}>
                                                  {(video.title || video.youtubeVideoId) ?? video.youtubeVideoId} ·{' '}
                                                  {formatVideoMetaSummary(video, { includeDuration: false })}
                                                </option>
                                              ))}
                                            </optgroup>
                                          )}
                                        </select>
                                        {selectedVideoData && selectedVideoSectionsWithCandidates.length > 0 ? (
                                          <div className="section-preview">
                                            <p className="artist-preview__hint">구간을 클릭하면 시간이 자동으로 입력됩니다.</p>
                                            <ul className="video-item__sections">
                                              {selectedVideoSectionsWithCandidates.map((section, index) => (
                                                <li
                                                  key={`${section.startSec}-${section.endSec}-${index}`}
                                                  className="video-item__section"
                                                  onClick={() => applyVideoSectionToClip(section, `구간 ${index + 1}`)}
                                                  role="button"
                                                  tabIndex={0}
                                                  onKeyDown={(event) =>
                                                    handleInteractiveListItemKeyDown(event, () =>
                                                      applyVideoSectionToClip(section, `구간 ${index + 1}`)
                                                    )
                                                  }
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
                                      </>
                                    )}
                                    <label htmlFor="libraryClipTitle">클립 제목</label>
                                    <input
                                      id="libraryClipTitle"
                                      placeholder="클립 제목"
                                      value={clipForm.title}
                                      onChange={(event) =>
                                        setClipForm((prev) => ({ ...prev, title: event.target.value }))
                                      }
                                      required={clipFieldsRequired}
                                      disabled={creationDisabled}
                                    />
                                    <div className="clip-range-control" aria-label="클립 구간 슬라이더">
                                      <div className="clip-range-control__header">
                                        <span>슬라이더로 시작/종료를 조정하세요.</span>
                                        {clipRangeMax ? (
                                          <span className="clip-range-control__duration">
                                            전체 {formatSeconds(clipRangeMax)}
                                          </span>
                                        ) : null}
                                      </div>
                                      {clipRangeMax ? (
                                        <div className="clip-range-control__timeline" aria-hidden="true">
                                          <div className="clip-range-control__timeline-track" />
                                          {clipRangeMax > 0
                                            ? selectedVideoSectionsWithCandidates.map((section, index) => {
                                                const startPercent = Math.min(
                                                  (section.startSec / clipRangeMax) * 100,
                                                  100
                                                );
                                                const endPercent = Math.min(
                                                  (section.endSec / clipRangeMax) * 100,
                                                  100
                                                );
                                                const width = Math.max(endPercent - startPercent, 0.75);
                                                return (
                                                  <span
                                                    key={`${section.startSec}-${section.endSec}-${index}`}
                                                    className="clip-range-control__chapter"
                                                    style={{
                                                      left: `${startPercent}%`,
                                                      width: `${width}%`
                                                    }}
                                                    title={`${section.title || '추천 구간'} (${formatSeconds(
                                                      section.startSec
                                                    )} → ${formatSeconds(section.endSec)})`}
                                                  />
                                                );
                                              })
                                            : null}
                                          <span
                                            className="clip-range-control__pin clip-range-control__pin--start"
                                            style={{ left: `${clipRangeStartPercent}%` }}
                                          />
                                          <span
                                            className="clip-range-control__pin clip-range-control__pin--end"
                                            style={{ left: `${clipRangeEndPercent}%` }}
                                          />
                                        </div>
                                      ) : null}
                                      <div className="clip-range-control__row">
                                        <div className="clip-range-control__slider-group">
                                          <label className="clip-range-control__label" htmlFor="clipRangeStart">
                                            시작 위치
                                          </label>
                                          <input
                                            id="clipRangeStart"
                                            type="range"
                                            min={0}
                                            max={clipRangeMax}
                                            step={CLIP_NUDGE_STEP}
                                            value={previewStartSec}
                                            onChange={(event) =>
                                              updateClipStartFromSlider(Number(event.target.value), { preview: true })
                                            }
                                            onKeyDown={handleRangeKeyDown('start')}
                                            disabled={creationDisabled}
                                          />
                                        </div>
                                        <div className="clip-range-control__fine-tune" aria-label="시작 위치 미세 조정">
                                          <p className="clip-range-control__fine-tune-label">미세 조정</p>
                                          <div className="clip-range-control__fine-tune-actions">
                                            <button
                                              type="button"
                                              className="clip-range-control__fine-tune-button"
                                              onClick={() =>
                                                nudgeClipBoundary('start', -CLIP_NUDGE_LARGE_STEP, { preview: true })
                                              }
                                              disabled={creationDisabled}
                                            >
                                              −1s
                                            </button>
                                            <button
                                              type="button"
                                              className="clip-range-control__fine-tune-button"
                                              onClick={() =>
                                                nudgeClipBoundary('start', -CLIP_NUDGE_STEP, { preview: true })
                                              }
                                              disabled={creationDisabled}
                                            >
                                              −0.5s
                                            </button>
                                            <button
                                              type="button"
                                              className="clip-range-control__fine-tune-button"
                                              onClick={() =>
                                                nudgeClipBoundary('start', CLIP_NUDGE_STEP, { preview: true })
                                              }
                                              disabled={creationDisabled}
                                            >
                                              +0.5s
                                            </button>
                                            <button
                                              type="button"
                                              className="clip-range-control__fine-tune-button"
                                              onClick={() =>
                                                nudgeClipBoundary('start', CLIP_NUDGE_LARGE_STEP, { preview: true })
                                              }
                                              disabled={creationDisabled}
                                            >
                                              +1s
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                      <div className="clip-range-control__row clip-range-control__row--end">
                                        <div className="clip-range-control__slider-group">
                                          <label className="clip-range-control__label" htmlFor="clipRangeEnd">
                                            종료 위치
                                          </label>
                                          <input
                                            id="clipRangeEnd"
                                            type="range"
                                            min={previewStartSec + CLIP_NUDGE_STEP}
                                            max={clipRangeMax}
                                            step={CLIP_NUDGE_STEP}
                                            value={previewEndSec}
                                            onChange={(event) =>
                                              updateClipEndFromSlider(Number(event.target.value), { preview: true })
                                            }
                                            onKeyDown={handleRangeKeyDown('end')}
                                            disabled={creationDisabled}
                                          />
                                        </div>
                                        <div className="clip-range-control__fine-tune" aria-label="종료 위치 미세 조정">
                                          <p className="clip-range-control__fine-tune-label">미세 조정</p>
                                          <div className="clip-range-control__fine-tune-actions">
                                            <button
                                              type="button"
                                              className="clip-range-control__fine-tune-button"
                                              onClick={() =>
                                                nudgeClipBoundary('end', -CLIP_NUDGE_LARGE_STEP, { preview: true })
                                              }
                                              disabled={creationDisabled}
                                            >
                                              −1s
                                            </button>
                                            <button
                                              type="button"
                                              className="clip-range-control__fine-tune-button"
                                              onClick={() =>
                                                nudgeClipBoundary('end', -CLIP_NUDGE_STEP, { preview: true })
                                              }
                                              disabled={creationDisabled}
                                            >
                                              −0.5s
                                            </button>
                                            <button
                                              type="button"
                                              className="clip-range-control__fine-tune-button"
                                              onClick={() =>
                                                nudgeClipBoundary('end', CLIP_NUDGE_STEP, { preview: true })
                                              }
                                              disabled={creationDisabled}
                                            >
                                              +0.5s
                                            </button>
                                            <button
                                              type="button"
                                              className="clip-range-control__fine-tune-button"
                                              onClick={() =>
                                                nudgeClipBoundary('end', CLIP_NUDGE_LARGE_STEP, { preview: true })
                                              }
                                              disabled={creationDisabled}
                                            >
                                              +1s
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                      <div className="clip-range-control__times">
                                        <span>시작 {formatSeconds(previewStartSec)}</span>
                                        <span>종료 {formatSeconds(previewEndSec)}</span>
                                      </div>
                                      <p className="clip-range-control__hint">
                                        슬라이더에 포커스한 뒤 ←/→ 키(Shift 누르고 사용 시 ±1초)로 빠르게 미세 조정할 수 있습니다.
                                      </p>
                                      <div className="clip-range-control__actions">
                                        <button
                                          type="button"
                                          className="clip-range-control__action"
                                          onClick={applyThirtySecondRange}
                                          disabled={creationDisabled}
                                        >
                                          종료를 시작 후 30초로 설정
                                        </button>
                                        <button
                                          type="button"
                                          className="clip-range-control__action clip-range-control__action--ghost"
                                          onClick={applyFullVideoRange}
                                          disabled={creationDisabled}
                                        >
                                          영상 전체 구간 사용
                                        </button>
                                      </div>
                                    </div>
                                    <div className="clip-time-row">
                                      <fieldset className="clip-time-fieldset">
                                        <legend>시작 시간</legend>
                                        <div className="clip-time-quick-actions">
                                          <button
                                            type="button"
                                            className="clip-time-quickset"
                                            onClick={applyPlaybackPositionToClipStart}
                                            disabled={!hasPlaybackPlayer || creationDisabled}
                                          >
                                            현재 위치로 시작 설정
                                          </button>
                                        </div>
                                        {shouldUseCompactTimeInputs ? (
                                          <div className="clip-time-inputs clip-time-inputs--compact">
                                            <label htmlFor="libraryClipStartTotal">총 초</label>
                                            <input
                                              id="libraryClipStartTotal"
                                              type="text"
                                              inputMode="numeric"
                                              placeholder="0"
                                              value={clipStartCompactValue}
                                              onChange={handleClipCompactTimeChange('start')}
                                              disabled={creationDisabled}
                                            />
                                            <p className="clip-time-hint">현재 {formatSeconds(parsedPreviewStartSec)}</p>
                                          </div>
                                        ) : (
                                          <div className="clip-time-inputs">
                                            <div className="clip-time-input">
                                              <label htmlFor="libraryClipStartHours">시간</label>
                                              <input
                                                id="libraryClipStartHours"
                                                type="text"
                                                inputMode="numeric"
                                                placeholder="0"
                                                maxLength={3}
                                                value={clipForm.startHours}
                                                onChange={handleClipTimePartChange('startHours')}
                                                disabled={creationDisabled}
                                              />
                                            </div>
                                            <div className="clip-time-input">
                                              <label htmlFor="libraryClipStartMinutes">분</label>
                                              <input
                                                id="libraryClipStartMinutes"
                                                type="text"
                                                inputMode="numeric"
                                                placeholder="00"
                                                maxLength={2}
                                                value={clipForm.startMinutes}
                                                onChange={handleClipTimePartChange('startMinutes')}
                                                disabled={creationDisabled}
                                              />
                                            </div>
                                            <div className="clip-time-input">
                                              <label htmlFor="libraryClipStartSeconds">초</label>
                                              <input
                                                id="libraryClipStartSeconds"
                                                type="text"
                                                inputMode="numeric"
                                                placeholder="00"
                                                maxLength={2}
                                                value={clipForm.startSeconds}
                                                onChange={handleClipTimePartChange('startSeconds')}
                                                required={clipFieldsRequired}
                                                disabled={creationDisabled}
                                              />
                                            </div>
                                          </div>
                                        )}
                                      </fieldset>
                                      <fieldset className="clip-time-fieldset">
                                        <legend>종료 시간</legend>
                                        <div className="clip-time-quick-actions">
                                          <button
                                            type="button"
                                            className="clip-time-quickset"
                                            onClick={applyPlaybackPositionToClipEnd}
                                            disabled={!hasPlaybackPlayer || creationDisabled}
                                          >
                                            현재 위치로 종료 설정
                                          </button>
                                        </div>
                                        {shouldUseCompactTimeInputs ? (
                                          <div className="clip-time-inputs clip-time-inputs--compact">
                                            <label htmlFor="libraryClipEndTotal">총 초</label>
                                            <input
                                              id="libraryClipEndTotal"
                                              type="text"
                                              inputMode="numeric"
                                              placeholder="0"
                                              value={clipEndCompactValue}
                                              onChange={handleClipCompactTimeChange('end')}
                                              disabled={creationDisabled}
                                            />
                                            <p className="clip-time-hint">현재 {formatSeconds(previewEndSec)}</p>
                                          </div>
                                        ) : (
                                          <div className="clip-time-inputs">
                                            <div className="clip-time-input">
                                              <label htmlFor="libraryClipEndHours">시간</label>
                                              <input
                                                id="libraryClipEndHours"
                                                type="text"
                                                inputMode="numeric"
                                                placeholder="0"
                                                maxLength={3}
                                                value={clipForm.endHours}
                                                onChange={handleClipTimePartChange('endHours')}
                                                disabled={creationDisabled}
                                              />
                                            </div>
                                            <div className="clip-time-input">
                                              <label htmlFor="libraryClipEndMinutes">분</label>
                                              <input
                                                id="libraryClipEndMinutes"
                                                type="text"
                                                inputMode="numeric"
                                                placeholder="00"
                                                maxLength={2}
                                                value={clipForm.endMinutes}
                                                onChange={handleClipTimePartChange('endMinutes')}
                                                disabled={creationDisabled}
                                              />
                                            </div>
                                            <div className="clip-time-input">
                                              <label htmlFor="libraryClipEndSeconds">초</label>
                                              <input
                                                id="libraryClipEndSeconds"
                                                type="text"
                                                inputMode="numeric"
                                                placeholder="00"
                                                maxLength={2}
                                                value={clipForm.endSeconds}
                                                onChange={handleClipTimePartChange('endSeconds')}
                                                required={clipFieldsRequired}
                                                disabled={creationDisabled}
                                              />
                                            </div>
                                          </div>
                                        )}
                                      </fieldset>
                                    </div>
                                    <label htmlFor="libraryClipTags">태그</label>
                                    <div className="chip-input">
                                      <div className="chip-input__list" aria-live="polite">
                                        {parseTags(clipForm.tags).map((tag) => (
                                          <span key={tag} className="chip-input__chip">
                                            <span className="chip-input__chip-label">{tag}</span>
                                            <button
                                              type="button"
                                              className="chip-input__remove"
                                              onClick={() => handleClipTagRemove(tag)}
                                              aria-label={`${tag} 태그 제거`}
                                              disabled={creationDisabled}
                                            >
                                              ×
                                            </button>
                                          </span>
                                        ))}
                                        <input
                                          id="libraryClipTags"
                                          className="chip-input__input"
                                          placeholder="태그 입력 (콤마나 엔터)"
                                          value={clipForm.tagInput}
                                          onChange={(event) => handleClipTagInputChange(event.target.value)}
                                          onKeyDown={handleClipTagKeyDown}
                                          onBlur={commitClipTagInput}
                                          disabled={creationDisabled}
                                        />
                                      </div>
                                    </div>
                                    <p className="form-hint">엔터(Enter) 또는 콤마(,)로 태그를 추가하세요.</p>
                                    <label htmlFor="libraryClipOriginalComposer">원곡자</label>
                                    <input
                                      id="libraryClipOriginalComposer"
                                      placeholder="예: 원곡 또는 작곡가"
                                      value={clipForm.originalComposer}
                                      onChange={(event) =>
                                        setClipForm((prev) => ({ ...prev, originalComposer: event.target.value }))
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
                                <>
                                  <div className="clip-preview">
                                    <h4>프리뷰</h4>
                                    {selectedVideoData ? (
                                      <>
                                        <p className="form-hint">
                                          {formatVideoMetaSummary(selectedVideoData, {
                                            includeDuration: false
                                          })}{' '}
                                          영상 ·{' '}
                                          {selectedVideoData.title || selectedVideoData.youtubeVideoId}
                                        </p>
                                        <div className="clip-preview__player">
                                          <Suspense
                                            fallback={
                                              <div className="clip-preview__player-loading" role="status" aria-live="polite">
                                                프리뷰를 준비하는 중…
                                              </div>
                                            }
                                          >
                                            <ClipPlayer
                                              youtubeVideoId={selectedVideoData.youtubeVideoId}
                                              startSec={previewStartSec}
                                              endSec={previewEndSec}
                                              autoplay={false}
                                              onPlayerInstanceChange={handleClipPreviewPlayerChange}
                                            />
                                          </Suspense>
                                        </div>
                                      </>
                                    ) : (
                                      <p className="empty-state">클립 프리뷰를 확인하려면 영상을 선택하세요.</p>
                                    )}
                                  </div>
                                  <div className="auto-detect">
                                    <div className="number-row">
                                      <select
                                        id="libraryDetectVideo"
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
                                                {formatVideoMetaSummary(video, { includeDuration: false })}
                                              </option>
                                            ))}
                                          </optgroup>
                                        )}
                                        {officialVideos.length > 0 && (
                                          <optgroup label="공식 영상">
                                            {officialVideos.map((video) => (
                                              <option key={video.id} value={video.id}>
                                                {(video.title || video.youtubeVideoId) ?? video.youtubeVideoId} ·{' '}
                                                {formatVideoMetaSummary(video, { includeDuration: false })}
                                              </option>
                                            ))}
                                          </optgroup>
                                        )}
                                      </select>
                                      <select
                                        id="libraryDetectMode"
                                        value={autoDetectMode}
                                        onChange={(event) => setAutoDetectMode(event.target.value)}
                                        disabled={creationDisabled}
                                      >
                                        <option value="chapters">챕터 기반</option>
                                        <option value="captions">자막 기반</option>
                                        <option value="combined">혼합</option>
                                      </select>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={runAutoDetect}
                                      disabled={creationDisabled || !selectedVideo}
                                    >
                                      자동으로 클립 제안 받기
                                    </button>
                                  </div>
                                </>
                              )}
                            </section>
                          )}
                          {activeLibraryView === 'videoList' && (
                            <section ref={videoListSectionRef} className="artist-library__detail-section">
                            <div className="artist-library__section-header">
                              <h4>영상 목록</h4>
                              {isArtistVideosLoading ? (
                                <div className="artist-library__status artist-library__status--skeleton" role="status">
                                  <span className="skeleton skeleton--pill" />
                                  <span className="skeleton skeleton--pill skeleton--wide" />
                                </div>
                              ) : displayableVideos.length > 0 ? (
                                <span className="artist-library__status">{displayableVideos.length}개 영상</span>
                              ) : null}
                            </div>
                            {isArtistVideosLoading ? (
                              <ul className="artist-library__video-list artist-library__video-list--skeleton">
                                {Array.from({ length: 3 }).map((_, index) => (
                                  <li key={`video-skeleton-${index}`} className="artist-library__video-item">
                                    <div className="skeleton skeleton--thumbnail" />
                                    <div className="artist-library__video-meta">
                                      <span className="skeleton skeleton--text" />
                                      <span className="skeleton skeleton--text skeleton--short" />
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            ) : displayableVideos.length === 0 ? (
                              <p className="artist-library__empty">영상 목록이 비어 있습니다.</p>
                            ) : (
                              <ul className="artist-library__video-list">
                                {shouldShowSelectedVideoPreview && selectedVideoData && (
                                  <li className="artist-library__video-preview">
                                    <div className="artist-library__video-preview-meta">
                                      <span className="artist-library__video-preview-title">
                                        {selectedVideoData.title || selectedVideoData.youtubeVideoId || '제목 없는 영상'}
                                      </span>
                                      <span className="artist-library__video-preview-subtitle">
                                        {formatVideoMetaSummary(selectedVideoData)}
                                      </span>
                                    </div>
                                    {selectedVideoData.youtubeVideoId ? (
                                      <div className="artist-library__video-preview-player">
                                        <Suspense
                                          fallback={
                                            <div
                                              className="artist-library__video-preview-loading"
                                              role="status"
                                              aria-live="polite"
                                            >
                                              미리보기를 불러오는 중…
                                            </div>
                                          }
                                        >
                                          <ClipPlayer
                                            youtubeVideoId={selectedVideoData.youtubeVideoId}
                                            startSec={0}
                                            endSec={
                                              selectedVideoDurationSec && selectedVideoDurationSec > 0
                                                ? selectedVideoDurationSec
                                                : undefined
                                            }
                                          />
                                        </Suspense>
                                      </div>
                                    ) : (
                                      <p className="artist-library__video-preview-empty">
                                        유튜브 영상 정보가 없어 재생할 수 없습니다.
                                      </p>
                                    )}
                                  </li>
                                )}
                                {VIDEO_CATEGORY_METADATA.map(({ key, label }) => {
                                  const videosInCategory = categorizedVideos[key];
                                  if (videosInCategory.length === 0) {
                                    return null;
                                  }
                                  const isExpanded = expandedVideoCategories[key];
                                  return (
                                    <li key={key} className="artist-library__video-category">
                                      <button
                                        type="button"
                                        className="artist-library__video-category-toggle"
                                        onClick={() =>
                                          setExpandedVideoCategories((prev) => ({
                                            ...prev,
                                            [key]: !prev[key]
                                          }))
                                        }
                                        aria-expanded={isExpanded}
                                      >
                                        <span className="artist-library__video-category-label">{label}</span>
                                        <span className="artist-library__video-category-count">
                                          {videosInCategory.length}곡
                                        </span>
                                        <span aria-hidden="true" className="artist-library__video-category-icon">
                                          {isExpanded ? '▾' : '▸'}
                                        </span>
                                      </button>
                                      {isExpanded && (
                                        <ul className="artist-library__video-sublist">
                                          {videosInCategory.map((video) => renderVideoListItem(video))}
                                        </ul>
                                      )}
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                            </section>
                          )}
                          {activeLibraryView === 'clipList' && (
                            <section ref={clipListSectionRef} className="artist-library__detail-section">
                            <div className="artist-library__section-header">
                              <h4>클립 목록</h4>
                              {selectedVideoData && (
                                <span className="artist-library__status">
                                  {selectedVideoData.title || selectedVideoData.youtubeVideoId || '제목 없는 영상'}
                                </span>
                              )}
                            </div>
                            {artistLibraryClips.length === 0 ? (
                              <p className="artist-library__empty">클립 목록이 비어 있습니다.</p>
                            ) : (
                              <>
                                {selectedVideoData && selectedVideoIsHidden && (
                                  <p className="artist-preview__hint">
                                    댓글 구간에서 자동 저장된 클립입니다. 영상은 라이브러리에 등록되지 않습니다.
                                  </p>
                                )}
                                {activeClipPreview && (
                                  <ClipPreviewPanel
                                    clipTitle={activeClipPreview.clipTitle}
                                    videoTitle={activeClipPreview.videoTitle}
                                    rangeLabel={activeClipPreview.rangeLabel}
                                    tags={activeClipPreview.tags}
                                    isEditing={activeClipPreview.isEditing}
                                  >
                                    <Suspense
                                      fallback={
                                        <div
                                          className="artist-library__clip-preview-loading"
                                          role="status"
                                          aria-live="polite"
                                        >
                                          플레이어 준비 중…
                                        </div>
                                      }
                                    >
                                      <ClipPlayer
                                        youtubeVideoId={activeClipPreview.youtubeVideoId}
                                        startSec={activeClipPreview.startSec}
                                        endSec={activeClipPreview.endSec}
                                        autoplay
                                      />
                                    </Suspense>
                                  </ClipPreviewPanel>
                                )}
                                <ClipList
                                  clips={artistLibraryClips}
                                  getItemKey={(clip) => clip.id}
                                  renderItem={renderClipListItem}
                                  itemData={clipListItemData}
                                  className="artist-library__clip-list"
                                />
                              </>
                            )}
                            </section>
                          )}
                        </div>
                      </div>
                    ) : noFilteredArtists ? (
                      <div className="artist-empty">검색 결과가 없습니다.</div>
                    ) : (
                      <ArtistLibraryGrid
                        artists={artistList}
                        getArtistId={(artist) => artist.id}
                        selectedArtistId={selectedArtistId}
                        onArtistClick={handleArtistClick}
                        ariaLabelledby="artist-library-heading"
                        renderCard={(artist, { isActive, onSelect }) => (
                          <ArtistLibraryCard
                            artist={artist}
                            isActive={isActive}
                            onSelect={onSelect}
                            cardData={artist.cardData}
                            showTags={false}
                          />
                        )}
                      />
                    )}
                    </>
                  );

                  if (isMobileViewport) {
                    return (
                      <>
                      <div className="artist-library__mobile-topbar">
                        <div className="artist-library__mobile-icon" aria-hidden="true">
                          <span aria-hidden="true">☰</span>
                        </div>
                        <div className="artist-library__mobile-logo" aria-hidden="true">
                          <img src={utahubLogo} alt="" />
                        </div>
                        <div className="artist-library__mobile-actions">
                          <LanguageToggle className="artist-library__language-toggle" variant="compact" />
                          <button
                            type="button"
                            className="mobile-auth-trigger"
                            aria-label={mobileAuthTriggerLabel}
                            aria-haspopup="dialog"
                            aria-expanded={isMobileAuthOverlayOpen}
                            aria-controls="mobileAuthDialog"
                            onClick={() => setMobileAuthOverlayOpen(true)}
                          >
                            <span aria-hidden="true" className="mobile-auth-trigger__icon">
                              🔐
                            </span>
                          </button>
                        </div>
                      </div>
                      <div
                        className="artist-library__mobile-tabs"
                        role="group"
                        aria-label={translate('artistDirectory.mobileTabsAria')}
                      >
                        {mobileArtistTabs.map((tab) => {
                          const isActiveTab = activeSection === tab.id;
                          const tabLabel =
                            tab.id === 'library'
                              ? translate('artistDirectory.mobileTab.library')
                              : translate('artistDirectory.mobileTab.catalog');
                          return (
                            <Link
                              key={`mobile-switch-${tab.id}`}
                              role="button"
                              aria-pressed={isActiveTab}
                              className={`artist-library__mobile-tab${isActiveTab ? ' is-active' : ''}`}
                              to={SECTION_PATHS[tab.id]}
                            >
                              {tabLabel}
                            </Link>
                          );
                        })}
                      </div>
                      <div className="artist-library__mobile-context">
                        <span className="artist-library__mobile-context-label">VTUBERS</span>
                        <div className="artist-library__mobile-context-button" aria-hidden="true">
                          <span className="artist-library__mobile-context-value">
                            {selectedArtist
                              ? `${selectedArtist.displayName || selectedArtist.name} ${translate(
                                  'artistDirectory.mobileContext.selectedSuffix'
                                )}`
                              : translate('artistDirectory.mobileContext.all')}
                          </span>
                          <span className="artist-library__mobile-context-icon">▾</span>
                        </div>
                      </div>
                      <h3 id="artist-library-heading" className="artist-library__mobile-title visually-hidden">
                        {translate('artistDirectory.heading')}
                      </h3>
                      <p className="artist-library__mobile-description visually-hidden">
                        {translate('artistDirectory.subtitle')}
                      </p>
                        <div className="artist-library__scroll-region">
                          {mainContent}
                        </div>
                      </>
                    );
                  }

                  return (
                    <>
                      {/* ✅ [수정] 중복되는 제목 텍스트 제거하고 버튼만 우측 정렬 */}
                      <div className="artist-library__header" style={{ justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="artist-library__register"
                          onClick={openArtistRegistration}
                        >
                          {translate('artistDirectory.register')}
                        </button>
                      </div>
                      {mainContent}
                    </>
                  );
                })()}
              </div>

            </div>
          </section>
              }
            />

            <Route
              path={SECTION_PATHS.catalog}
              element={
          <section
            className={`content-panel${activeSection === 'catalog' ? ' active' : ''}`}
            role="tabpanel"
            aria-labelledby="sidebar-tab-catalog"
            hidden={activeSection !== 'catalog'}
          >
            <div className="panel catalog-panel">
              {isClipsLoading ? (
                <div className="catalog-panel__status" role="status" aria-live="polite">
                  {translate('catalog.loading')}
                </div>
              ) : isCatalogEmpty ? (
                <div className="catalog-panel__empty-state">
                  <h3>{translate('catalog.emptyHeading')}</h3>
                  <p>{translate('catalog.emptyDescription')}</p>
                </div>
              ) : (
                <SongCatalogTable
                  clips={artistLibraryClips}
                  videos={libraryVideos}
                  songs={artistLibrarySongVideos}
                />
              )}
            </div>
          </section>
              }
            />

            <Route path="/" element={<Navigate to={SECTION_PATHS.library} replace />} />
            <Route path="*" element={<Navigate to={SECTION_PATHS.library} replace />} />

          </Routes>

        </div>
          </div>
      </main>

        {!isMobileViewport && rightSidebarContent}

        {isMobileViewport && (
          <div
            className={`mobile-full-player-overlay${isFullPlayerOpen ? ' open' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-hidden={isFullPlayerOpen ? undefined : true}
            aria-label="전체 화면 플레이어"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                setIsFullPlayerOpen(false);
              }
            }}
          >
            <div className="player-header-controls">
              <button
                className="collapse-btn"
                onClick={() => setIsFullPlayerOpen(false)}
                aria-label="플레이어 닫기"
              >
                ⌄
              </button>

              <div className="header-title-info">
                <span className="header-source-text">노래</span>
              </div>

              <button className="more-options-btn" type="button">
                ⋮
              </button>
            </div>

            <div className="player-main-section">
              <img
                src={
                  currentPlaybackItem?.thumbnailUrl ||
                  (currentPlaybackItem?.youtubeVideoId
                    ? `https://img.youtube.com/vi/${currentPlaybackItem.youtubeVideoId}/hqdefault.jpg`
                    : '/default-album.jpg')
                }
                className="big-album-art"
                alt="Album Art"
                onClick={() => setIsFullPlayerOpen(false)}
                style={{ cursor: 'pointer', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}
              />

              <div className="player-track-info">
                <div className="player-track-title">{currentPlaybackItem?.title ?? '재생 중인 곡 없음'}</div>
                <div className="player-track-artist">{currentPlaybackItem?.subtitle ?? 'Artist'}</div>
              </div>

              <input type="range" className="progress-slider" style={{ width: '100%', marginBottom: '24px' }} />

              <div className="player-main-controls">
                <button className="ctrl-btn-lg" type="button" aria-label="셔플">🔀</button>
                <button className="ctrl-btn-lg" type="button" onClick={handlePlaybackPrevious} aria-label="이전 곡">
                  ⏮
                </button>
                <button className="play-btn-xl" type="button" onClick={handlePlaybackToggle} aria-label="재생/일시정지">
                  {isPlaybackActive ? '⏸' : '▶'}
                </button>
                <button className="ctrl-btn-lg" type="button" onClick={handlePlaybackNext} aria-label="다음 곡">
                  ⏭
                </button>
                <button className="ctrl-btn-lg" type="button" aria-label="반복">
                  🔁
                </button>
              </div>
            </div>

            <div className="player-queue-section">
              <div className="queue-label">다음 트랙</div>
              <PlaylistWidgetControls
                queue={filteredPlaybackBarItems}
                currentClip={currentPlaybackItem}
                onPlayClip={handleMobileQueueSelect}
                onRemoveFromQueue={handleMobileQueueRemove}
                isOpen
                onClose={handleMobileQueueClose}
                isMobileView
              />
            </div>
          </div>
        )}

        <div className="bottom-fixed-area">
          {(hasPlaybackItems || (isMobileViewport && !isFullPlayerOpen)) && (
            <div className="bottom-stack">
              {hasPlaybackItems && (
                isMobileViewport ? (
                  <div
                    className="mobile-mini-player-trigger"
                    onClick={handleMiniPlayerClick}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        handleMiniPlayerClick();
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label="전체 화면 플레이어 열기"
                  >
                    <PlaylistBar
                      items={playbackBarItems}
                      queueItems={filteredPlaybackBarItems}
                      currentItemKey={activePlaybackKey}
                      currentIndex={currentPlaybackIndex}
                      className="stack-player"
                      playbackActivationNonce={playbackActivationNonce}
                      isPlaying={isPlaybackActive}
                      isExpanded={false}
                      isMobileViewport={isMobileViewport}
                      showQueueToggle={false}
                      canCreatePlaylist={isAuthenticated}
                      canModifyPlaylist={canModifyActivePlaylist}
                      playlistSearchQuery={playlistSearchQuery}
                      onPlaylistSearchChange={setPlaylistSearchQuery}
                      onCreatePlaylist={handleCreatePlaylist}
                      onPlayPause={handlePlaybackToggle}
                      onNext={handlePlaybackNext}
                      onPrevious={handlePlaybackPrevious}
                      repeatMode={playbackRepeatMode}
                      onRepeatModeChange={setPlaybackRepeatMode}
                      onToggleExpanded={handlePlaybackToggleExpanded}
                      onSelectItem={handlePlaybackSelect}
                      onRemoveItem={handlePlaybackQueueRemove}
                      onTrackEnded={handlePlaybackEnded}
                      onPlayerInstanceChange={handlePlaybackPlayerChange}
                    />
                  </div>
                ) : (
                  <PlaylistBar
                    items={playbackBarItems}
                    queueItems={filteredPlaybackBarItems}
                    currentItemKey={activePlaybackKey}
                    currentIndex={currentPlaybackIndex}
                    className="stack-player"
                    playbackActivationNonce={playbackActivationNonce}
                    isPlaying={isPlaybackActive}
                    isExpanded={isPlaybackExpanded}
                    isMobileViewport={isMobileViewport}
                    showQueueToggle
                    canCreatePlaylist={isAuthenticated}
                    canModifyPlaylist={canModifyActivePlaylist}
                    playlistSearchQuery={playlistSearchQuery}
                    onPlaylistSearchChange={setPlaylistSearchQuery}
                    onCreatePlaylist={handleCreatePlaylist}
                    onPlayPause={handlePlaybackToggle}
                    onNext={handlePlaybackNext}
                    onPrevious={handlePlaybackPrevious}
                    repeatMode={playbackRepeatMode}
                    onRepeatModeChange={setPlaybackRepeatMode}
                    onToggleExpanded={handlePlaybackToggleExpanded}
                    onSelectItem={handlePlaybackSelect}
                    onRemoveItem={handlePlaybackQueueRemove}
                    onTrackEnded={handlePlaybackEnded}
                    onPlayerInstanceChange={handlePlaybackPlayerChange}
                  />
                )
              )}

              {isMobileViewport && !isFullPlayerOpen && (
                <nav className="mobile-bottom-nav" aria-label="하단 탐색">
                  {sidebarTabs.map((tab) => {
                    const isActive = activeSection === tab.id;
                    const tabIcon = { latest: '🏠', catalog: '🔍', library: '📚', live: '🎤' }[tab.id];

                    return (
                      <Link
                        key={`mobile-tab-${tab.id}`}
                        className={`nav-item${isActive ? ' active' : ''}`}
                        to={SECTION_PATHS[tab.id]}
                        aria-current={isActive ? 'page' : undefined}
                        aria-label={tab.label}
                      >
                        <span className="nav-icon" aria-hidden="true">
                          {tabIcon}
                        </span>
                        <span className="nav-label">{tab.label}</span>
                      </Link>
                    );
                  })}
                </nav>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
