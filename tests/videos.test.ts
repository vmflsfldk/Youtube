import test from "node:test";
import assert from "node:assert/strict";

import {
  __listVideosForTests as listVideos,
  __resetWorkerTestState,
  __setHasEnsuredVideoColumnsForTests
} from "../src/worker";
import type { Env } from "../src/worker";

interface D1Result<T> {
  success: boolean;
  error?: string;
  results?: T[];
  meta: {
    duration: number;
    changes: number;
    last_row_id?: number;
  };
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run<T = unknown>(): Promise<D1Result<T>>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

type ArtistTableRow = {
  id: number;
  created_by: number;
  name: string;
  display_name: string | null;
  youtube_channel_id: string;
  youtube_channel_title: string | null;
  profile_image_url: string | null;
};

type VideoTableRow = {
  id: number;
  artist_id: number;
  youtube_video_id: string;
  title: string;
  duration_sec: number | null;
  thumbnail_url: string | null;
  channel_id: string | null;
  description: string | null;
  captions_json: string | null;
  category: string | null;
  content_type: string | null;
  hidden: number | null;
  original_composer: string | null;
};

class FakeStatement implements D1PreparedStatement {
  private values: unknown[] = [];

  constructor(private readonly db: FakeD1Database, private readonly query: string) {}

  bind(...values: unknown[]): D1PreparedStatement {
    this.values = values;
    return this;
  }

  first<T = unknown>(): Promise<T | null> {
    return this.db.handleFirst<T>(this.query, this.values);
  }

  all<T = unknown>(): Promise<D1Result<T>> {
    return this.db.handleAll<T>(this.query, this.values);
  }

  run<T = unknown>(): Promise<D1Result<T>> {
    return this.db.handleRun<T>(this.query, this.values);
  }
}

class FakeD1Database implements D1Database {
  constructor(
    private readonly artists: ArtistTableRow[],
    private readonly videos: VideoTableRow[]
  ) {}

  prepare(query: string): D1PreparedStatement {
    return new FakeStatement(this, query);
  }

  async handleFirst<T>(query: string, values: unknown[]): Promise<T | null> {
    const normalized = query.replace(/\s+/g, " ").trim().toLowerCase();
    if (normalized.startsWith("select id from artists where id = ? and created_by = ?")) {
      const [artistId, createdBy] = values as [number, number];
      const artist = this.artists.find((row) => row.id === artistId && row.created_by === createdBy);
      return (artist ? ({ id: artist.id } as unknown as T) : null);
    }
    if (normalized.startsWith("select id from artists where id = ?")) {
      const [artistId] = values as [number];
      const artist = this.artists.find((row) => row.id === artistId);
      return (artist ? ({ id: artist.id } as unknown as T) : null);
    }
    if (
      normalized.startsWith("select v.id, v.artist_id") &&
      normalized.includes("from videos v join artists a on a.id = v.artist_id where v.id = ?")
    ) {
      const [videoId] = values as [number];
      const video = this.videos.find((row) => row.id === videoId);
      if (!video) {
        return null;
      }
      const artist = this.artists.find((row) => row.id === video.artist_id);
      if (!artist) {
        return null;
      }
      return {
        ...video,
        artist_name: artist.name,
        artist_display_name: artist.display_name,
        artist_youtube_channel_id: artist.youtube_channel_id,
        artist_youtube_channel_title: artist.youtube_channel_title,
        artist_profile_image_url: artist.profile_image_url
      } as unknown as T;
    }
    return null;
  }

  async handleAll<T>(query: string, values: unknown[]): Promise<D1Result<T>> {
    const normalized = query.replace(/\s+/g, " ").trim().toLowerCase();
    if (
      normalized.startsWith("select v.id, v.artist_id") &&
      normalized.includes("from videos v join artists a on a.id = v.artist_id")
    ) {
      const filterByContentType = normalized.includes("and v.content_type = ?");
      const [artistId, maybeContentType] = values as [number, string?];
      const rows = this.videos
        .filter((row) => row.artist_id === artistId)
        .filter((row) => Number(row.hidden ?? 0) === 0)
        .filter((row) => (row.category ?? "").toLowerCase() !== "live")
        .filter((row) =>
          !filterByContentType || (row.content_type ?? "").toUpperCase() === (maybeContentType ?? "").toUpperCase()
        )
        .map((row) => {
          const artist = this.artists.find((item) => item.id === row.artist_id);
          if (!artist) {
            return null;
          }
          return {
            ...row,
            artist_name: artist.name,
            artist_display_name: artist.display_name,
            artist_youtube_channel_id: artist.youtube_channel_id,
            artist_youtube_channel_title: artist.youtube_channel_title,
            artist_profile_image_url: artist.profile_image_url
          } as unknown as T;
        })
        .filter((row): row is T => row !== null)
        .sort((a, b) => (b as unknown as { id: number }).id - (a as unknown as { id: number }).id);
      return { success: true, meta: { duration: 0, changes: 0 }, results: rows };
    }
    return { success: true, meta: { duration: 0, changes: 0 }, results: [] };
  }

  async handleRun<T>(_query: string, _values: unknown[]): Promise<D1Result<T>> {
    return { success: true, meta: { duration: 0, changes: 0 } };
  }
}

const corsConfig = { origin: null, requestHeaders: null, allowPrivateNetwork: false } as const;

test("listVideos allows access to another user's artist", async (t) => {
  __resetWorkerTestState();
  __setHasEnsuredVideoColumnsForTests(true);
  t.after(() => __resetWorkerTestState());

  const artists: ArtistTableRow[] = [
    { id: 1, created_by: 1 },
    { id: 2, created_by: 2 }
  ];
  const videos: VideoTableRow[] = [
    {
      id: 101,
      artist_id: 2,
      youtube_video_id: "abcdefghijk",
      title: "Collaboration Video",
      duration_sec: 180,
      thumbnail_url: "thumb",
      channel_id: "channel",
      description: null,
      captions_json: null,
      category: null,
      content_type: "OFFICIAL",
      hidden: 0,
      original_composer: "Composer A"
    }
  ];
  const db = new FakeD1Database(artists, videos);
  const env: Env = { DB: db };
  const user = { id: 1, email: "user1@example.com", displayName: null };
  const url = new URL("https://example.com/api/videos?artistId=2");

  const response = await listVideos(url, env, user, corsConfig);
  assert.equal(response.status, 200);

  const payload = (await response.json()) as any[];
  assert.equal(payload.length, 1);
  assert.equal(payload[0].artistId, 2);
  assert.equal(payload[0].youtubeVideoId, "abcdefghijk");
  assert.equal(payload[0].originalComposer, "Composer A");
});

test("listVideos allows unauthenticated access", async (t) => {
  __resetWorkerTestState();
  __setHasEnsuredVideoColumnsForTests(true);
  t.after(() => __resetWorkerTestState());

  const artists: ArtistTableRow[] = [
    {
      id: 3,
      created_by: 3,
      name: "Public Artist",
      display_name: "Public",
      youtube_channel_id: "chan-3",
      youtube_channel_title: "Channel Public",
      profile_image_url: "https://example.com/artist3.png"
    }
  ];
  const videos: VideoTableRow[] = [
    {
      id: 301,
      artist_id: 3,
      youtube_video_id: "unauthvid",
      title: "Public Video",
      duration_sec: 120,
      thumbnail_url: "thumb",
      channel_id: "channel",
      description: null,
      captions_json: null,
      category: null,
      content_type: "OFFICIAL",
      hidden: 0,
      original_composer: null
    }
  ];

  const db = new FakeD1Database(artists, videos);
  const env: Env = { DB: db };
  const url = new URL("https://example.com/api/videos?artistId=3");

  const response = await listVideos(url, env, null, corsConfig);
  assert.equal(response.status, 200);

  const payload = (await response.json()) as any[];
  assert.equal(payload.length, 1);
  assert.equal(payload[0].artistId, 3);
  assert.equal(payload[0].artistName, "Public Artist");
  assert.equal(payload[0].artistDisplayName, "Public");
  assert.equal(payload[0].artistYoutubeChannelId, "chan-3");
  assert.equal(payload[0].artistYoutubeChannelTitle, "Channel Public");
  assert.equal(payload[0].artistProfileImageUrl, "https://example.com/artist3.png");
  assert.equal(payload[0].youtubeVideoId, "unauthvid");
  assert.equal(payload[0].originalComposer, null);
});

test("listVideos excludes live videos", async (t) => {
  __resetWorkerTestState();
  __setHasEnsuredVideoColumnsForTests(true);
  t.after(() => __resetWorkerTestState());

  const artists: ArtistTableRow[] = [
    {
      id: 4,
      created_by: 4,
      name: "Live Artist",
      display_name: "Performer",
      youtube_channel_id: "chan-4",
      youtube_channel_title: "Channel Four",
      profile_image_url: "https://example.com/artist4.png"
    }
  ];
  const videos: VideoTableRow[] = [
    {
      id: 401,
      artist_id: 4,
      youtube_video_id: "livenotallowed",
      title: "Live Stream",
      duration_sec: 3600,
      thumbnail_url: "thumb",
      channel_id: "channel",
      description: null,
      captions_json: null,
      category: "LIVE",
      content_type: "OFFICIAL",
      hidden: 0,
      original_composer: null
    },
    {
      id: 402,
      artist_id: 4,
      youtube_video_id: "coverallowed",
      title: "Cover Song",
      duration_sec: 240,
      thumbnail_url: "thumb",
      channel_id: "channel",
      description: null,
      captions_json: null,
      category: "cover",
      content_type: "OFFICIAL",
      hidden: 0,
      original_composer: null
    }
  ];

  const db = new FakeD1Database(artists, videos);
  const env: Env = { DB: db };

  const defaultUrl = new URL("https://example.com/api/videos?artistId=4");
  const defaultResponse = await listVideos(defaultUrl, env, null, corsConfig);
  assert.equal(defaultResponse.status, 200);
  const defaultPayload = (await defaultResponse.json()) as any[];
  assert.deepEqual(
    defaultPayload.map((video) => video.youtubeVideoId),
    ["coverallowed"]
  );
  assert(defaultPayload.every((video) => video.artistName === "Live Artist"));

  const filteredUrl = new URL("https://example.com/api/videos?artistId=4&contentType=OFFICIAL");
  const filteredResponse = await listVideos(filteredUrl, env, null, corsConfig);
  assert.equal(filteredResponse.status, 200);
  const filteredPayload = (await filteredResponse.json()) as any[];
  assert.deepEqual(
    filteredPayload.map((video) => video.youtubeVideoId),
    ["coverallowed"]
  );
  assert(filteredPayload.every((video) => video.artistDisplayName === "Performer"));
});
