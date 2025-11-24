import type { VideoResponse } from '../types/media';

const isYouTubeHost = (host: string): boolean => {
  const lower = host.toLowerCase();
  return lower === 'youtube.com' || lower === 'youtu.be' || lower.endsWith('.youtube.com');
};

export const extractYouTubeVideoId = (url: string): string | null => {
  const trimmed = url.trim();
  if (!trimmed) {
    return null;
  }

  const directIdMatch = trimmed.match(/^[a-zA-Z0-9_-]{11}$/);
  if (directIdMatch) {
    return directIdMatch[0];
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    try {
      parsed = new URL(`https://${trimmed}`);
    } catch {
      return null;
    }
  }

  if (!isYouTubeHost(parsed.hostname)) {
    return null;
  }

  const pathname = parsed.pathname.split('/').filter(Boolean);
  const candidateSources = [
    parsed.searchParams.get('v'),
    parsed.searchParams.get('vi'),
    pathname[0] === 'watch' ? parsed.searchParams.get('v') : null,
    pathname[0] === 'embed' && pathname[1] ? pathname[1] : null,
    pathname[0] === 'v' && pathname[1] ? pathname[1] : null,
    pathname[0] === 'shorts' && pathname[1] ? pathname[1] : null,
    parsed.hostname.includes('youtu.be') && pathname[0] ? pathname[0] : null
  ];

  const candidate = candidateSources.find(
    (value): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{11}$/.test(value)
  );
  return candidate ?? null;
};

export const getThumbnailUrl = (videoId: string): string =>
  `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

export const isClipSourceVideo = (video: VideoResponse): boolean =>
  (video.contentType ?? '').toUpperCase() === 'CLIP_SOURCE';

export const shouldIncludeVideoInSongCatalog = (video: VideoResponse): boolean => {
  if (isClipSourceVideo(video)) {
    return false;
  }
  const category = (video.category ?? '').toLowerCase();
  if (category === 'live') {
    return false;
  }
  return true;
};

export const normalizeVideo = (video: VideoResponse): VideoResponse => {
  const duration =
    typeof video.durationSec === 'number'
      ? video.durationSec
      : Number.isFinite(Number(video.durationSec))
        ? Number(video.durationSec)
        : null;
  const hidden =
    typeof video.hidden === 'boolean' ? video.hidden : video.hidden ? true : undefined;

  return {
    ...video,
    durationSec: duration,
    thumbnailUrl: video.thumbnailUrl ?? null,
    hidden
  };
};

type UpsertResult = {
  items: VideoResponse[];
  existed: boolean;
};

export const upsertVideoById = (collection: VideoResponse[], video: VideoResponse): UpsertResult => {
  let found = false;
  const items = collection.map((item) => {
    if (item.id === video.id) {
      found = true;
      return video;
    }
    return item;
  });
  if (found) {
    return { items, existed: true };
  }
  return { items: [...collection, video], existed: false };
};

export const mergeVideoIntoCollections = (
  collections: { videos: VideoResponse[]; songVideos: VideoResponse[] },
  video: VideoResponse
): {
  normalizedVideo: VideoResponse;
  existed: boolean;
  videos: VideoResponse[];
  songVideos: VideoResponse[];
} => {
  const normalizedVideo = normalizeVideo(video);
  const videoResult = upsertVideoById(collections.videos, normalizedVideo);

  let nextSongVideos = collections.songVideos;
  if (shouldIncludeVideoInSongCatalog(normalizedVideo)) {
    nextSongVideos = upsertVideoById(collections.songVideos, normalizedVideo).items;
  } else {
    nextSongVideos = collections.songVideos.filter((item) => item.id !== normalizedVideo.id);
  }

  return {
    normalizedVideo,
    existed: videoResult.existed,
    videos: videoResult.items,
    songVideos: nextSongVideos
  };
};
