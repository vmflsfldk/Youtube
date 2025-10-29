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
    if (!artistId || Number.isNaN(currentArtistId)) {
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
        return;
      }

      const fetchedVideoIdSet = new Set(fetchedVideos.map((video) => video.id));

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
        return mergedVideos;
      });

      setHiddenVideoIds((prev) => prev.filter((id) => !fetchedVideoIdSet.has(id)));
    } catch (error) {
      if (options?.signal?.aborted) {
        return;
      }
      onError(error);
    } finally {
      if (!options?.signal?.aborted) {
        setArtistVideosLoading(false);
      }
    }
  };
