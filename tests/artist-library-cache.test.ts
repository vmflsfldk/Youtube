import test from "node:test";
import assert from "node:assert/strict";

import { createReloadArtistVideos } from "../frontend/src/library/reloadArtistVideos";
import type { VideoResponse } from "../frontend/src/types/media";

type StateUpdater<T> = (updater: T | ((previous: T) => T)) => void;

const applyStateUpdate = <T,>(state: { current: T }, updater: Parameters<StateUpdater<T>>[0]): void => {
  state.current = typeof updater === "function" ? (updater as (prev: T) => T)(state.current) : updater;
};

test("artist detail cache persists after closing and reopening", async () => {
  const fetchArtistIds: number[] = [];
  const fetchVideos = async (artistId: number, _signal?: AbortSignal): Promise<VideoResponse[]> => {
    fetchArtistIds.push(artistId);
    return [
      {
        id: 101,
        artistId: 123,
        youtubeVideoId: "video-101",
        title: "First Video",
        durationSec: 180,
        thumbnailUrl: null,
        contentType: "OFFICIAL",
        category: null,
        hidden: false,
        originalComposer: null,
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
        artists: []
      }
    ];
  };

  const videosState = { current: [
    {
      id: 202,
      artistId: 456,
      youtubeVideoId: "video-202",
      title: "Other Artist Video",
      durationSec: 200,
      thumbnailUrl: null,
      contentType: "OFFICIAL",
      category: null,
      hidden: false,
      originalComposer: null,
      createdAt: "2024-02-01T00:00:00.000Z",
      updatedAt: "2024-02-01T00:00:00.000Z",
      artists: []
    }
  ] as VideoResponse[] };
  const hiddenVideoIdsState = { current: [101, 999] };
  const selectedVideoState = { current: 777 as number | null };
  const artistLoadingState = { current: false };
  const loadingTransitions: boolean[] = [];

  const setVideos: StateUpdater<VideoResponse[]> = (update) => applyStateUpdate(videosState, update);
  const setHiddenVideoIds: StateUpdater<number[]> = (update) => applyStateUpdate(hiddenVideoIdsState, update);
  const setSelectedVideo: StateUpdater<number | null> = (update) => applyStateUpdate(selectedVideoState, update);
  const setArtistVideosLoading: StateUpdater<boolean> = (update) => {
    applyStateUpdate(artistLoadingState, update);
    loadingTransitions.push(artistLoadingState.current);
  };

  const compareVideos = (a: VideoResponse, b: VideoResponse): number => {
    const parsedB = Date.parse(b.createdAt ?? '');
    const parsedA = Date.parse(a.createdAt ?? '');
    const timeDiff = (Number.isNaN(parsedB) ? 0 : parsedB) - (Number.isNaN(parsedA) ? 0 : parsedA);
    if (timeDiff !== 0) {
      return timeDiff;
    }
    return b.id - a.id;
  };

  const reloadForArtist = createReloadArtistVideos({
    artistId: "123",
    fetchVideos,
    setVideos,
    setHiddenVideoIds,
    setSelectedVideo,
    setArtistVideosLoading,
    compareVideos,
    onError: (error) => {
      throw error instanceof Error ? error : new Error(String(error));
    }
  });

  await reloadForArtist();

  assert.equal(fetchArtistIds.length, 1);
  assert.deepEqual(fetchArtistIds, [123]);
  assert.equal(
    videosState.current.filter((video) => video.artistId === 123).length,
    1,
    "Expected artist videos to be loaded"
  );
  assert.deepEqual(
    hiddenVideoIdsState.current,
    [999],
    "Hidden video ids referencing fetched videos should be cleared"
  );
  assert.deepEqual(loadingTransitions.slice(0, 2), [true, false]);

  const reloadAfterClear = createReloadArtistVideos({
    artistId: "",
    fetchVideos,
    setVideos,
    setHiddenVideoIds,
    setSelectedVideo,
    setArtistVideosLoading,
    compareVideos,
    onError: (error) => {
      throw error instanceof Error ? error : new Error(String(error));
    }
  });

  await reloadAfterClear();

  assert.equal(fetchArtistIds.length, 1, "Clearing the artist should not trigger a refetch");
  assert.equal(
    videosState.current.filter((video) => video.artistId === 123).length,
    1,
    "Cached artist videos should remain after clearing the detail view"
  );
  assert.equal(selectedVideoState.current, null, "Clearing selection should drop the active video");
  assert.equal(loadingTransitions.at(-1), false, "Clearing selection should end in a non-loading state");

  assert.equal(
    videosState.current.some((video) => video.artistId === 123),
    true,
    "Reopening the artist should immediately show cached videos"
  );
});
