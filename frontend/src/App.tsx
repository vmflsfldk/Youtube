import {
  ChangeEvent,
  FormEvent,
  KeyboardEvent,
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
import axios from 'axios';
import ClipList, { type ClipListRenderContext, type ClipListRenderResult } from './components/ClipList';
import PlaylistBar, {
  type PlaybackRepeatMode,
  type PlaylistBarItem
} from './components/PlaylistBar';
import AuthPanel from './components/AuthPanel';
import utahubLogo from './assets/utahub-logo.svg';
import ArtistLibraryGrid from './ArtistLibraryGrid';
import ArtistLibraryCard, { type ArtistLibraryCardData } from './components/ArtistLibraryCard';
import ArtistSearchControls from './components/ArtistSearchControls';
import ClipPreviewPanel from './components/ClipPreviewPanel';
import SongCatalogTable from './components/SongCatalogTable';
import type { VideoResponse, VideoSectionResponse } from './types/media';
import {
  isClipSourceVideo,
  mergeVideoIntoCollections,
  normalizeVideo
} from './utils/videos';

const ClipPlayer = lazy(() => import('./components/ClipPlayer'));

type MaybeArray<T> =
  | T[]
  | { items?: T[]; data?: T[]; results?: T[] }
  | null
  | undefined;

const VIDEO_CATEGORY_ORDER = ['cover', 'live', 'original'] as const;

type VideoCategoryKey = (typeof VIDEO_CATEGORY_ORDER)[number];
type VideoCategorySelection = '' | VideoCategoryKey;

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

type ClipFormState = {
  title: string;
  startHours: string;
  startMinutes: string;
  startSeconds: string;
  endHours: string;
  endMinutes: string;
  endSeconds: string;
  tags: string;
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

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

const sanitizeTimePartInput = (value: string, options: { maxLength?: number; maxValue?: number | null }) => {
  const digitsOnly = value.replace(/\D/g, '');
  const truncated = options.maxLength ? digitsOnly.slice(0, options.maxLength) : digitsOnly;

  if (truncated === '') {
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
    const numeric = Number(value);
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
  const secondValue = parsePart(seconds, 59);

  return hourValue * 3600 + minuteValue * 60 + secondValue;
};

const createClipTimePartValues = (totalSeconds: number) => {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return { hours: '0', minutes: '00', seconds: '00' } as const;
  }

  const total = Math.floor(totalSeconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  return {
    hours: hours.toString(),
    minutes: minutes.toString().padStart(2, '0'),
    seconds: seconds.toString().padStart(2, '0')
  } as const;
};

const isActivationKey = (key: string): boolean =>
  key === 'Enter' || key === ' ' || key === 'Space' || key === 'Spacebar';

const handleInteractiveListItemKeyDown = (
  event: KeyboardEvent<HTMLElement>,
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

const parseTags = (value: string): string[] =>
  value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);

const showAlert = (message: string) => {
  if (typeof window !== 'undefined' && typeof window.alert === 'function') {
    window.alert(message);
  } else {
    console.warn('[yt-clip] alert:', message);
  }
};

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
  agency?: string | null;
  tags: string[];
}

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
  artistId?: number;
  artistName?: string | null;
  artistDisplayName?: string | null;
  artistYoutubeChannelId?: string | null;
  artistYoutubeChannelTitle?: string | null;
  artistProfileImageUrl?: string | null;
}

type PlaylistEntry =
  | { type: 'video'; itemId: number; video: VideoResponse }
  | { type: 'clip'; itemId: number; clip: ClipResponse; parentVideo: VideoResponse | null };

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
  canModifyPlaylist: boolean;
  playlistClipItemMap: Map<number, PlaylistItemResponse>;
  handleClipPlaylistToggle: (clipId: number) => Promise<void>;
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

type ArtistFormState = {
  name: string;
  channelId: string;
  tags: string;
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
  tags: '',
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

type SectionKey = 'library' | 'catalog' | 'playlist';

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
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<UserResponse | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(false);
  const [artists, setArtists] = useState<PreparedArtist[]>([]);
  const [videos, setVideos] = useState<VideoResponse[]>([]);
  const [publicVideos, setPublicVideos] = useState<VideoResponse[]>([]);
  const [songVideos, setSongVideos] = useState<VideoResponse[]>([]);
  const [publicSongVideos, setPublicSongVideos] = useState<VideoResponse[]>([]);
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
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<number | null>(null);
  const [clipCandidates, setClipCandidates] = useState<ClipCandidateResponse[]>([]);
  const libraryVideos = isAuthenticated ? videos : publicVideos;
  const librarySongVideos = isAuthenticated ? songVideos : publicSongVideos;
  const libraryClips = isAuthenticated ? clips : publicClips;
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
  const [isClipUpdateSaving, setClipUpdateSaving] = useState(false);
  const [clipEditStatus, setClipEditStatus] = useState<ClipEditStatus | null>(null);
  const [videoCategoryStatusMap, setVideoCategoryStatusMap] = useState<
    Record<number, VideoCategoryMutationStatus>
  >({});
  const autoDetectInFlightRef = useRef(false);
  const autoDetectedVideoIdRef = useRef<number | null>(null);
  const videoListSectionRef = useRef<HTMLElement | null>(null);
  const clipListSectionRef = useRef<HTMLElement | null>(null);
  const handleArtistSearchQueryChange = useCallback((value: string) => {
    setArtistSearch((previous) => {
      if (previous.query === value) {
        return previous;
      }
      return { ...previous, query: value };
    });
  }, []);

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
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQuery = window.matchMedia('(max-width: 960px)');
    const updateViewportState = (event: MediaQueryListEvent | MediaQueryList) => {
      setIsMobileViewport(event.matches);
    };

    updateViewportState(mediaQuery);

    const listener = (event: MediaQueryListEvent) => updateViewportState(event);
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }

    mediaQuery.addListener(listener);
    return () => mediaQuery.removeListener(listener);
  }, []);

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
        : { maxLength: 2, maxValue: 59 };
      const sanitized = sanitizeTimePartInput(event.target.value, options);
      setClipEditForm((prev) => ({ ...prev, [key]: sanitized }));
      setClipEditStatus(null);
    },
    []
  );
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
  const [activeSection, setActiveSection] = useState<SectionKey>('library');
  const [activeClipId, setActiveClipId] = useState<number | null>(null);

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

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    setClipsLoading(false);
  }, [isAuthenticated]);

  useEffect(() => {
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
    const trimmedAgency = artistForm.agency.trim();
    const parsedTags = parseTags(artistForm.tags);
    const { ko, en, jp } = artistForm.countries;
    const hasCountrySelection = ko || en || jp;
    setArtistPreviewError(null);
    if (!trimmedName || !trimmedChannelId) {
      return;
    }
    const requestContext = {
      channelId: trimmedChannelId,
      name: trimmedName,
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
      showAlert(duplicateMessage);
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
          agency: trimmedAgency
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
        showAlert(message);
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
      setActiveSection('library');
      setArtistRegistrationOpen(false);
      setActiveLibraryView('videoForm');
    },
    [
      setActiveSection,
      setArtistRegistrationOpen,
      setClipForm,
      setActiveLibraryView,
      setSelectedVideo,
      setVideoForm
    ]
  );

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
            showAlert(message);
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
          songVideos?: MaybeArray<VideoResponse>;
        }>('/public/library', {
          signal: controller.signal
        });
        if (cancelled) {
          return;
        }
        const fetchedVideos = ensureArray(response.data?.videos).map(normalizeVideo);
        const normalizedClips = ensureArray(response.data?.clips).map(normalizeClip);
        setPublicVideos(fetchedVideos);
        const fetchedSongVideos = ensureArray(response.data?.songVideos).map(normalizeVideo);
        setPublicSongVideos(fetchedSongVideos);
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
    if (!isAuthenticated) {
      setVideos([]);
      setSongVideos([]);
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
          songVideos?: MaybeArray<VideoResponse>;
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
        const fetchedSongVideos = ensureArray(response.data?.songVideos).map(normalizeVideo);
        setSongVideos(fetchedSongVideos);
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
      showAlert('클립 제목을 입력해 주세요.');
      return;
    }

    const startSec = parseClipTimeParts(
      clipForm.startHours,
      clipForm.startMinutes,
      clipForm.startSeconds
    );
    const endSec = parseClipTimeParts(clipForm.endHours, clipForm.endMinutes, clipForm.endSeconds);

    if (endSec <= startSec) {
      showAlert('클립 종료 시간은 시작 시간보다 커야 합니다.');
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
        showAlert(message);
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
      if (trimmedValue.length > 0) {
        setSelectedVideo(null);
      }
    },
    [setClipForm, setSelectedVideo, setVideoForm]
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

  const handleArtistClick = (artistId: number) => {
    setVideoForm((prev) => ({ ...prev, artistId: String(artistId) }));
    setSelectedVideo(null);
    setActiveClipId(null);
    setClipCandidates([]);
    setVideoSubmissionStatus(null);
  };

  const handleArtistClear = () => {
    setVideoForm((prev) => ({ ...prev, artistId: '' }));
    setSelectedVideo(null);
    setVideos([]);
    setClipCandidates([]);
    setActiveLibraryView('videoList');
    setVideoSubmissionStatus(null);
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
      showAlert('재생목록을 사용하려면 로그인해 주세요.');
      return null;
    }

    const visibility = activePlaylist?.visibility ?? 'PRIVATE';
    const titleInput = window.prompt('새 재생목록 제목을 입력해 주세요.');

    if (titleInput === null) {
      return null;
    }

    const trimmedTitle = titleInput.trim();

    if (trimmedTitle.length === 0) {
      showAlert('재생목록 제목을 입력해 주세요.');
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
      return normalized;
    } catch (error) {
      const message = extractAxiosErrorMessage(error, '재생목록을 생성하지 못했습니다.');
      showAlert(message);
      console.error('Failed to create playlist', error);
      return null;
    }
  }, [activePlaylist, applyUserPlaylistUpdate, authHeaders, http, isAuthenticated]);

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
        showAlert(message);
        console.error('Failed to remove playlist item', error);
      }
    },
    [activePlaylist, applyUserPlaylistUpdate, authHeaders, http, isAuthenticated]
  );

  const handleVideoPlaylistToggle = useCallback(
    async (videoId: number) => {
      if (!isAuthenticated) {
        showAlert('재생목록을 사용하려면 로그인해 주세요.');
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
        showAlert(message);
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
        showAlert('재생목록을 사용하려면 로그인해 주세요.');
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
        showAlert(message);
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

  const handleVideoCardKeyDown = (event: KeyboardEvent<HTMLDivElement>, videoId: number) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleLibraryVideoSelect(videoId);
    }
  };

  const openArtistRegistration = useCallback(() => {
    setActiveSection('library');
    setArtistRegistrationOpen((prev) => !prev);
  }, [setActiveSection, setArtistRegistrationOpen]);

  const selectedArtist = artists.find((artist) => artist.id === Number(videoForm.artistId));
  const noArtistsRegistered = artists.length === 0;
  const noFilteredArtists = !noArtistsRegistered && filteredArtists.length === 0 && !selectedArtist;
  const artistList = filteredArtists;
  const selectedArtistId = selectedArtist?.id ?? null;
  const artistLibraryVideos = useMemo(() => {
    if (selectedArtistId === null) {
      return libraryVideos;
    }
    return libraryVideos.filter((video) => video.artistId === selectedArtistId);
  }, [libraryVideos, selectedArtistId]);

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
    if (!selectedArtistId) {
      return;
    }
    setVideoForm((prev) => ({ ...prev, artistId: String(selectedArtistId) }));
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
  const handleShowVideoList = useCallback(() => {
    setActiveLibraryView('videoList');
    scrollToSectionWithFrame(videoListSectionRef);
  }, [setActiveLibraryView, scrollToSectionWithFrame]);
  const handleShowClipList = useCallback(() => {
    setActiveLibraryView('clipList');
    scrollToSectionWithFrame(clipListSectionRef);
  }, [setActiveLibraryView, scrollToSectionWithFrame]);
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
  const selectedVideoClips = useMemo(
    () => (selectedVideo ? libraryClips.filter((clip) => clip.videoId === selectedVideo) : []),
    [libraryClips, selectedVideo]
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
      canModifyPlaylist: canModifyActivePlaylist,
      playlistClipItemMap,
      handleClipPlaylistToggle
    }),
    [
      activeClipId,
      clipEditForm,
      clipEditStatus,
      selectedVideoData,
      creationDisabled,
      isClipUpdateSaving,
      canModifyActivePlaylist,
      playlistClipItemMap,
      handleClipPlaylistToggle
    ]
  );

  const activeClipPreview = useMemo<ClipPreviewData | null>(() => {
    if (activeSection !== 'library') {
      return null;
    }
    if (activeClipId === null) {
      return null;
    }

    const clip = libraryClips.find((candidate) => candidate.id === activeClipId);
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
    clips,
    clipEditForm.clipId,
    clipEditForm.startHours,
    clipEditForm.startMinutes,
    clipEditForm.startSeconds,
    clipEditForm.endHours,
    clipEditForm.endMinutes,
    clipEditForm.endSeconds,
    selectedVideoData,
    videos
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
        canModifyPlaylist,
        playlistClipItemMap: currentPlaylistClipItemMap,
        handleClipPlaylistToggle: toggleClipPlaylist
      } = itemData;

      const isActive = currentActiveClipId === clip.id;
      const hasYoutubeId = Boolean(clip.youtubeVideoId);
      const isEditingClip = currentClipEditForm.clipId === clip.id;
      const clipOriginalComposerTag =
        typeof clip.originalComposer === 'string' ? clip.originalComposer.trim() : '';
      const clipArtistName = (
        clip.artistDisplayName ??
        clip.artistName ??
        currentSelectedVideo?.artistDisplayName ??
        currentSelectedVideo?.artistName ??
        ''
      ).trim();
      const clipCategory = categorizeClip(clip, currentSelectedVideo ?? null);
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
                    </fieldset>
                    <fieldset className="clip-time-fieldset">
                      <legend>종료 시간</legend>
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

  const playbackBarItems = useMemo<PlaylistBarItem[]>(() => {
    return playlistEntries.map((entry, index) => {
      const key = resolvePlaylistEntryKey(entry, index);

      if (entry.type === 'video') {
        const video = entry.video;
        const youtubeVideoId = (video.youtubeVideoId ?? '').trim();
        const hasYoutube = youtubeVideoId.length > 0;
        const artistLabel =
          video.artistDisplayName || video.artistName || video.artistYoutubeChannelTitle || null;
        const summary = formatVideoMetaSummary(video, { includeDuration: false });
        const subtitleParts = [artistLabel, summary].filter((part): part is string => Boolean(part));
        const durationSec = parseDurationSeconds(video.durationSec);
        const durationLabel = durationSec !== null ? formatSeconds(durationSec) : null;
        const title =
          formatSongTitle(video.title, { fallback: video.youtubeVideoId || '제목 없는 영상' }) ||
          video.title ||
          video.youtubeVideoId ||
          '제목 없는 영상';

        return {
          itemId: entry.itemId,
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
      }

      const clip = entry.clip;
      const parentVideo = entry.parentVideo;
      const youtubeVideoId = (clip.youtubeVideoId || parentVideo?.youtubeVideoId || '').trim();
      const hasYoutube = youtubeVideoId.length > 0;
      const rawClipTitle =
        clip.title ||
        clip.sectionTitle ||
        clip.youtubeChapterTitle ||
        clip.videoTitle ||
        '제목 없는 클립';
      const clipTitle =
        formatSongTitle(clip.title, { tags: clip.tags, fallback: rawClipTitle }) || rawClipTitle;
      const artistLabel =
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
      const subtitleParts = [artistLabel, parentTitle].filter(
        (part): part is string => Boolean(part)
      );

      return {
        itemId: entry.itemId,
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
    });
  }, [playlistEntries, resolvePlaylistEntryKey]);

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
    setIsPlaybackExpanded((previous) => !previous);
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
      previous && selectedVideoClips.some((clip) => clip.id === previous) ? previous : null
    );
  }, [selectedVideoClips]);
  const playlistHeading = isAuthenticated ? '내 영상·클립 모음' : '공개 영상·클립 모음';
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
        id: 'catalog',
        label: '곡 DB',
        description: '등록된 곡과 클립을 아티스트·원곡자 기준으로 찾아보세요.',
        icon: (
          <svg viewBox="0 0 24 24" role="presentation" aria-hidden="true">
            <path
              d="M6.5 4A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20H18a1 1 0 0 0 0-2H6.5A.5.5 0 0 1 6 17.5V8h11.5a.5.5 0 0 1 .5.5V18a1 1 0 1 0 2 0V8.5A2.5 2.5 0 0 0 17.5 6H6V5.5A1.5 1.5 0 0 1 7.5 4H18a1 1 0 0 0 0-2H7.5A2.5 2.5 0 0 0 5 3.5v.618A2.5 2.5 0 0 1 6.5 4Z"
              fill="currentColor"
            />
          </svg>
        )
      },
      {
        id: 'playlist',
        label: '영상·클립 모음',
        description: '저장된 영상과 클립을 한눈에 확인하세요.',
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

    return tabs;
  }, []);

  const activeSidebarTab = sidebarTabs.find((tab) => tab.id === activeSection) ?? sidebarTabs[0];

  const previousAuthRef = useRef(isAuthenticated);

  useEffect(() => {
    if (!previousAuthRef.current && isAuthenticated) {
      setActiveSection('library');
    }
    previousAuthRef.current = isAuthenticated;
  }, [isAuthenticated]);


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
          <input
            id="artistTags"
            placeholder="예: 라이브, 커버"
            value={artistForm.tags}
            onChange={(event) => setArtistForm((prev) => ({ ...prev, tags: event.target.value }))}
            disabled={creationDisabled}
          />
          <p className="form-hint">콤마(,)로 구분하여 입력하세요.</p>
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
      </div>
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

  return (
    <>
      <div className="app-shell">
        <aside
          id="app-sidebar"
          className="sidebar"
          aria-label="주요 탐색"
          aria-hidden={isMobileViewport ? true : undefined}
      >
        <div className="sidebar__brand">
          <div className="sidebar__logo">
            <img src={utahubLogo} alt="UtaHub 로고" />
          </div>
          <div className="sidebar__brand-copy">
            <p className="sidebar__eyebrow">UtaHub</p>
            <h1>UtaHub Studio</h1>
          </div>
        </div>
        <AuthPanel
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
          <div className="mobile-appbar" aria-hidden="true">
            <div className="mobile-appbar__action-slot mobile-appbar__action-slot--leading" />
            <div className="mobile-appbar__title">
              <span className="mobile-appbar__brand">UtaHub</span>
              <span className="mobile-appbar__section">{activeSidebarTab.label}</span>
            </div>
            <div className="mobile-appbar__action-slot mobile-appbar__action-slot--trailing" />
          </div>
          <div className="content-header__body">
            <p className="content-header__eyebrow">UtaHub</p>
            <h2>{activeSidebarTab.label}</h2>
            <p className="content-header__description">{activeSidebarTab.description}</p>
          </div>
        </header>

        {isMobileViewport && (
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
        )}

        <div className="content-panels">

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
                    <h3 id="artist-library-heading">아티스트 디렉토리</h3>
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
                    <span>선택된 아티스트</span>
                    <strong>{selectedArtist.displayName || selectedArtist.name}</strong>
                  </div>
                )}
                <div className="artist-library__controls">
                  <div className="artist-directory__search-group">
                    <ArtistSearchControls
                      query={artistSearch.query}
                      mode={artistSearch.mode}
                      onQueryChange={handleArtistSearchQueryChange}
                      onModeChange={handleArtistSearchModeChange}
                      onClear={handleArtistSearchClear}
                    />
                  </div>
                  <div className="artist-directory__filter-group">
                    <div className="artist-directory__filter">
                      <label htmlFor="artistCountryFilter">서비스 국가</label>
                      <select
                        id="artistCountryFilter"
                        value={artistCountryFilter}
                        onChange={(event) =>
                          setArtistCountryFilter(event.target.value as 'all' | ArtistCountryKey)
                        }
                      >
                        <option value="all">전체</option>
                        {ARTIST_COUNTRY_METADATA.map((country) => (
                          <option key={country.key} value={country.key}>
                            {country.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="artist-directory__filter">
                      <label htmlFor="artistAgencyFilter">소속사</label>
                      <select
                        id="artistAgencyFilter"
                        value={artistAgencyFilter}
                        onChange={(event) => setArtistAgencyFilter(event.target.value)}
                      >
                        <option value="all">전체</option>
                        {artistAgencies.map((agency) => (
                          <option key={agency} value={agency}>
                            {agency}
                          </option>
                        ))}
                      </select>
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
                      <ArtistLibraryCard
                        artist={selectedArtist}
                        isActive
                        focusMode
                        interactive={false}
                        cardData={selectedArtist.cardData}
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
                            <p className="form-hint">YouTube URL에 live가 포함되면 자동으로 클립 등록으로 전환됩니다.</p>
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
                            </div>
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
                            <label htmlFor="libraryVideoCategory">영상 분류</label>
                            <select
                              id="libraryVideoCategory"
                              value={videoForm.category}
                              onChange={(event) =>
                                setVideoForm((prev) => ({
                                  ...prev,
                                  category: event.target.value as VideoCategorySelection
                                }))
                              }
                              disabled={creationDisabled}
                            >
                              {VIDEO_CATEGORY_OPTIONS.map(({ value, label }) => (
                                <option key={value || 'auto'} value={value}>
                                  {label}
                                </option>
                              ))}
                            </select>
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
                                <div className="clip-time-row">
                                  <fieldset className="clip-time-fieldset">
                                    <legend>시작 시간</legend>
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
                                  </fieldset>
                                  <fieldset className="clip-time-fieldset">
                                    <legend>종료 시간</legend>
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
                                  </fieldset>
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
                            <span className="artist-library__status">불러오는 중...</span>
                          ) : displayableVideos.length > 0 ? (
                            <span className="artist-library__status">{displayableVideos.length}개 영상</span>
                          ) : null}
                        </div>
                        {displayableVideos.length === 0 ? (
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
                        {selectedVideoClips.length === 0 ? (
                          selectedVideoData ? (
                            <p className="artist-library__empty">클립 목록이 비어 있습니다.</p>
                          ) : (
                            <p className="artist-library__empty">영상을 선택하면 클립 목록을 확인할 수 있습니다.</p>
                          )
                        ) : (
                          <>
                            {selectedVideoIsHidden && (
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
                              clips={selectedVideoClips}
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
                      />
                    )}
                  />
                )}
              </div>

            </div>
          </section>

          <section
            className={`content-panel${activeSection === 'catalog' ? ' active' : ''}`}
            role="tabpanel"
            aria-labelledby="sidebar-tab-catalog"
            hidden={activeSection !== 'catalog'}
          >
            <div className="panel catalog-panel">
              {isClipsLoading ? (
                <div className="catalog-panel__status" role="status" aria-live="polite">
                  곡 정보를 불러오는 중입니다…
                </div>
              ) : libraryClips.length === 0 ? (
                <div className="catalog-panel__empty-state">
                  <h3>아직 등록된 곡 정보가 없습니다.</h3>
                  <p>영상이나 클립을 추가하면 이곳에서 곡별 데이터를 확인할 수 있어요.</p>
                </div>
              ) : (
                <SongCatalogTable
                  clips={libraryClips}
                  videos={libraryVideos}
                  songs={librarySongVideos}
                />
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
              <div className="playlist-panel__header">
                <div className="playlist-panel__heading">
                  <h2>{playlistHeading}</h2>
                  <p className="playlist-subtitle">{playlistSubtitle}</p>
                </div>
                <div className="playlist-panel__selector">
                  <label className="playlist-selector__label" htmlFor="playlistSelector">
                    {playlistSelectorLabel}
                  </label>
                  {availablePlaylists.length > 0 ? (
                    <select
                      id="playlistSelector"
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
                      재생목록이 없습니다.
                    </div>
                  )}
                </div>
                <div className="playlist-search">
                  <input
                    id="playlistSearchInput"
                    type="search"
                    value={playlistSearchQuery}
                    onChange={(event) => setPlaylistSearchQuery(event.target.value)}
                    placeholder="영상 또는 클립 검색"
                    aria-label="영상 또는 클립 검색"
                  />
                </div>
              </div>
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
          </section>
        </div>
      </main>

      <nav className="mobile-bottom-nav" aria-label="하단 탐색">
        {sidebarTabs.map((tab) => {
          const isActive = activeSection === tab.id;
          return (
            <button
              key={`mobile-tab-${tab.id}`}
              type="button"
              className={`mobile-bottom-nav__tab${isActive ? ' is-active' : ''}`}
              onClick={() => setActiveSection(tab.id)}
              aria-current={isActive ? 'page' : undefined}
              aria-label={tab.label}
            >
              <span className="mobile-bottom-nav__icon">{tab.icon}</span>
            </button>
          );
        })}
      </nav>
      </div>
      <PlaylistBar
        items={playbackBarItems}
        currentItemKey={activePlaybackKey}
        currentIndex={currentPlaybackIndex}
        playbackActivationNonce={playbackActivationNonce}
        isPlaying={isPlaybackActive}
        isExpanded={isPlaybackExpanded}
        isMobileViewport={isMobileViewport}
        canCreatePlaylist={isAuthenticated}
        canModifyPlaylist={canModifyActivePlaylist}
        onCreatePlaylist={handleCreatePlaylist}
        onPlayPause={handlePlaybackToggle}
        onNext={handlePlaybackNext}
        onPrevious={handlePlaybackPrevious}
        repeatMode={playbackRepeatMode}
        onRepeatModeChange={setPlaybackRepeatMode}
        onToggleExpanded={handlePlaybackToggleExpanded}
        onSelectItem={handlePlaybackSelect}
        onRemoveItem={handlePlaylistEntryRemove}
        onTrackEnded={handlePlaybackEnded}
      />
    </>
  );
}
