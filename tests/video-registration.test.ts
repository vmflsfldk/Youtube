import test from 'node:test';
import assert from 'node:assert/strict';

import { mergeVideoIntoCollections } from '../frontend/src/utils/videos';
import type { VideoResponse } from '../frontend/src/types/media';

test('registering a video updates song catalog without reloading library', () => {
  const existingVideo: VideoResponse = {
    id: 1,
    artistId: 10,
    primaryArtistId: 10,
    youtubeVideoId: 'existing123',
    title: 'Existing Song',
    durationSec: 180,
    thumbnailUrl: 'thumb1',
    contentType: 'OFFICIAL',
    artists: [
      {
        id: 10,
        name: 'Artist 10',
        displayName: 'Artist 10',
        youtubeChannelId: 'chan-10',
        youtubeChannelTitle: null,
        profileImageUrl: null,
        isPrimary: true
      }
    ]
  };

  const initialState = {
    videos: [existingVideo],
    songVideos: [existingVideo]
  };

  const rawRegisteredVideo: VideoResponse = {
    id: 2,
    artistId: 10,
    primaryArtistId: 10,
    youtubeVideoId: 'new456',
    title: 'Newly Registered Song',
    durationSec: '245',
    thumbnailUrl: undefined,
    contentType: 'OFFICIAL',
    category: 'cover',
    artists: [
      {
        id: 10,
        name: 'Artist 10',
        displayName: 'Artist 10',
        youtubeChannelId: 'chan-10',
        youtubeChannelTitle: null,
        profileImageUrl: null,
        isPrimary: true
      }
    ]
  };

  const firstMerge = mergeVideoIntoCollections(initialState, rawRegisteredVideo);

  assert.equal(firstMerge.existed, false, 'new video should be treated as freshly registered');
  assert.equal(firstMerge.videos.length, 2, 'video library should include new video');
  assert.equal(firstMerge.songVideos.length, 2, 'song catalog should include new video');

  const insertedSong = firstMerge.songVideos.find((video) => video.id === rawRegisteredVideo.id);
  assert(insertedSong, 'song catalog must contain the registered video');
  assert.equal(insertedSong?.durationSec, 245, 'registered video should be normalised');
  assert.equal(insertedSong?.thumbnailUrl, null, 'registered video thumbnail should be normalised');

  const updatedVideo: VideoResponse = {
    ...rawRegisteredVideo,
    title: 'Updated Title'
  };

  const secondMerge = mergeVideoIntoCollections(
    { videos: firstMerge.videos, songVideos: firstMerge.songVideos },
    updatedVideo
  );

  assert.equal(secondMerge.existed, true, 'existing video should be detected');
  assert.equal(
    secondMerge.videos.length,
    firstMerge.videos.length,
    'video library should not create duplicates when updating'
  );
  assert.equal(
    secondMerge.songVideos.length,
    firstMerge.songVideos.length,
    'song catalog should remain deduplicated when updating'
  );
  const updatedSong = secondMerge.songVideos.find((video) => video.id === updatedVideo.id);
  assert.equal(updatedSong?.title, 'Updated Title', 'song catalog should reflect latest metadata');

  const liveVideoUpdate: VideoResponse = {
    ...updatedVideo,
    category: 'live'
  };

  const thirdMerge = mergeVideoIntoCollections(
    { videos: secondMerge.videos, songVideos: secondMerge.songVideos },
    liveVideoUpdate
  );

  assert.equal(thirdMerge.existed, true, 'category updates should apply to existing videos');
  assert.equal(
    thirdMerge.videos.length,
    secondMerge.videos.length,
    'video library should remain deduplicated after category change'
  );
  assert.equal(
    thirdMerge.songVideos.some((video) => video.id === liveVideoUpdate.id),
    false,
    'song catalog should exclude videos reclassified as live'
  );
  const libraryVideo = thirdMerge.videos.find((video) => video.id === liveVideoUpdate.id);
  assert.equal(libraryVideo?.category, 'live', 'video library should reflect updated category');
});

test('mergeVideoIntoCollections keeps shared video artist associations intact', () => {
  const sharedVideo: VideoResponse = {
    id: 100,
    artistId: 10,
    primaryArtistId: 10,
    youtubeVideoId: 'shared123',
    title: 'Shared Song',
    durationSec: 210,
    thumbnailUrl: null,
    contentType: 'OFFICIAL',
    artists: [
      {
        id: 10,
        name: 'Artist 10',
        displayName: 'Artist 10',
        youtubeChannelId: 'chan-10',
        youtubeChannelTitle: null,
        profileImageUrl: null,
        isPrimary: true
      }
    ]
  };

  const initialState = { videos: [sharedVideo], songVideos: [sharedVideo] };

  const updateFromPartner: VideoResponse = {
    id: 100,
    artistId: 20,
    primaryArtistId: 10,
    youtubeVideoId: 'shared123',
    title: 'Shared Song (updated)',
    durationSec: 215,
    thumbnailUrl: null,
    contentType: 'OFFICIAL',
    artists: [
      {
        id: 10,
        name: 'Artist 10',
        displayName: 'Artist 10',
        youtubeChannelId: 'chan-10',
        youtubeChannelTitle: null,
        profileImageUrl: null,
        isPrimary: true
      },
      {
        id: 20,
        name: 'Artist 20',
        displayName: 'Artist 20',
        youtubeChannelId: 'chan-20',
        youtubeChannelTitle: null,
        profileImageUrl: null,
        isPrimary: false
      }
    ]
  };

  const result = mergeVideoIntoCollections(initialState, updateFromPartner);

  assert.equal(result.videos.length, 1, 'video library should remain deduplicated');
  assert.equal(result.songVideos.length, 1, 'song catalog should remain deduplicated');

  const merged = result.videos[0];
  assert.equal(merged.artistId, 20, 'context artist should reflect last update');
  assert.equal(merged.primaryArtistId, 10, 'primary artist should remain unchanged');
  assert.deepEqual(
    merged.artists.map((artist) => ({ id: artist.id, primary: artist.isPrimary })),
    [
      { id: 10, primary: true },
      { id: 20, primary: false }
    ],
    'artist associations should include both performers'
  );
});
