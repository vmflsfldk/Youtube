import type { VideoResponse } from '../types/media';

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
