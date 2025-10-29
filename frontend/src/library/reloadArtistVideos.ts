import axios from 'axios';

import type { VideoResponse } from '../types/media';

type StateUpdater<T> = (value: T | ((previous: T) => T)) => void;

type VideoFetcher = (artistId: number, signal?: AbortSignal) => Promise<VideoResponse[]>;

type ReloadArtistVideosOptions = {
  artistId: string;
  fetchVideos: VideoFetcher;
  setVideos: StateUpdater<VideoResponse[]>;
  setHiddenVideoIds: StateUpdater<number[]>;
  setSelectedVideo: StateUpdater<number | null>;
  setArtistVideosLoading: StateUpdater<boolean>;
  compareVideos: (a: VideoResponse, b: VideoResponse) => number;
  onError?: (error: unknown) => void;
};

export const createReloadArtistVideos = ({
  artistId,
  fetchVideos,
  setVideos,
  setHiddenVideoIds,
  setSelectedVideo,
  setArtistVideosLoading,
  compareVideos,
  onError = (error) => console.error('Failed to load videos', error)
}: ReloadArtistVideosOptions) =>
  async (options?: { signal?: AbortSignal }) => {
    const currentArtistId = Number(artistId);
    console.debug('[reloadArtistVideos] Reload requested', {
      artistId,
      parsedArtistId: currentArtistId,
      aborted: options?.signal?.aborted ?? false,
    });
    if (!artistId || Number.isNaN(currentArtistId)) {
      console.debug('[reloadArtistVideos] Skipping reload due to invalid artistId', {
        artistId,
      });
      if (!options?.signal?.aborted) {
        setSelectedVideo(null);
        setArtistVideosLoading(false);
      }
      return;
    }

    if (!options?.signal?.aborted) {
      setArtistVideosLoading(true);
    }

    try {
      const fetchedVideos = await fetchVideos(currentArtistId, options?.signal);
      if (options?.signal?.aborted) {
        console.debug('[reloadArtistVideos] Reload aborted after fetch', {
          artistId: currentArtistId,
        });
        return;
      }

      const fetchedVideoIdSet = new Set(fetchedVideos.map((video) => video.id));
      console.debug('[reloadArtistVideos] Videos fetched', {
        artistId: currentArtistId,
        fetchedCount: fetchedVideos.length,
      });

      setVideos((previousVideos) => {
        const preservedVideos = previousVideos.filter((video) => {
          if (video.artistId !== currentArtistId) {
            return true;
          }
          if (video.hidden === true && !fetchedVideoIdSet.has(video.id)) {
            return true;
          }
          return false;
        });

        const mergedVideos = [...preservedVideos, ...fetchedVideos];
        mergedVideos.sort(compareVideos);
        console.debug('[reloadArtistVideos] Videos merged', {
          artistId: currentArtistId,
          preservedCount: preservedVideos.length,
          fetchedCount: fetchedVideos.length,
          mergedCount: mergedVideos.length,
        });
        return mergedVideos;
      });

      setHiddenVideoIds((prev) => {
        const remainingHiddenIds = prev.filter((id) => !fetchedVideoIdSet.has(id));
        console.debug('[reloadArtistVideos] Remaining hidden video IDs updated', {
          artistId: currentArtistId,
          remainingHiddenCount: remainingHiddenIds.length,
          remainingHiddenIds,
        });
        return remainingHiddenIds;
      });
    } catch (error) {
      if (options?.signal?.aborted) {
        console.debug('[reloadArtistVideos] Reload aborted during error handling', {
          artistId: currentArtistId,
        });
        return;
      }
      const isAxiosError = axios.isAxiosError(error);
      const enrichedError = {
        artistId: currentArtistId,
        isAxiosError,
        message: isAxiosError ? error.message : undefined,
        status: isAxiosError ? error.response?.status : undefined,
        originalError: error,
      };
      console.error('[reloadArtistVideos] Failed to load videos', enrichedError);
      onError(enrichedError);
    } finally {
      if (!options?.signal?.aborted) {
        setArtistVideosLoading(false);
      }
    }
  };
