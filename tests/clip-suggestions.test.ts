import test from "node:test";
import assert from "node:assert/strict";

import {
  __suggestClipCandidatesForTests as suggestClipCandidates,
  __setWorkerTestOverrides,
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
};

type ArtistTableRow = {
  id: number;
  created_by: number;
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
  private lastVideoId: number;

  constructor(readonly artists: ArtistTableRow[], readonly videos: VideoTableRow[] = []) {
    this.lastVideoId = videos.reduce((max, row) => Math.max(max, row.id), 0);
  }

  prepare(query: string): D1PreparedStatement {
    return new FakeStatement(this, query);
  }

  async handleFirst<T>(query: string, values: unknown[]): Promise<T | null> {
    const normalized = query.replace(/\s+/g, " ").trim().toLowerCase();
    if (normalized.startsWith("select id from artists")) {
      const [artistId, createdBy] = values as [number, number];
      const artist = this.artists.find((row) => row.id === artistId && row.created_by === createdBy);
      return (artist ? ({ id: artist.id } as unknown as T) : null);
    }
    if (normalized.startsWith("select v.*, a.created_by from videos") && normalized.includes("youtube_video_id")) {
      const [youtubeVideoId] = values as [string];
      const video = this.videos.find((row) => row.youtube_video_id === youtubeVideoId);
      if (!video) {
        return null;
      }
      const artist = this.artists.find((row) => row.id === video.artist_id);
      if (!artist) {
        return null;
      }
      return ({ ...video, created_by: artist.created_by } as unknown as T);
    }
    if (normalized.startsWith("select * from videos where id =")) {
      const [videoId] = values as [number];
      const video = this.videos.find((row) => row.id === videoId);
      return (video ? ({ ...video } as unknown as T) : null);
    }
    return null;
  }

  async handleAll<T>(_query: string, _values: unknown[]): Promise<D1Result<T>> {
    return { success: true, meta: { duration: 0, changes: 0 }, results: [] };
  }

  async handleRun<T>(query: string, values: unknown[]): Promise<D1Result<T>> {
    const normalized = query.replace(/\s+/g, " ").trim().toLowerCase();
    if (normalized.startsWith("update videos set")) {
      const [
        artistId,
        title,
        durationSec,
        thumbnailUrl,
        channelId,
        description,
        captionsJson,
        category,
        contentType,
        hidden,
        videoId
      ] = values as [
        number,
        string,
        number | null,
        string | null,
        string | null,
        string | null,
        string | null,
        string | null,
        string | null,
        number | null,
        number
      ];
      const video = this.videos.find((row) => row.id === videoId);
      if (!video) {
        return { success: false, error: "Video not found", meta: { duration: 0, changes: 0 } };
      }
      video.artist_id = artistId;
      video.title = title;
      video.duration_sec = durationSec ?? null;
      video.thumbnail_url = thumbnailUrl ?? null;
      video.channel_id = channelId ?? null;
      video.description = description ?? null;
      video.captions_json = captionsJson ?? null;
      video.category = category ?? null;
      video.content_type = contentType ?? null;
      video.hidden = hidden ?? 0;
      return { success: true, meta: { duration: 0, changes: 1 } };
    }
    if (normalized.startsWith("insert into videos")) {
      const [
        artistId,
        youtubeVideoId,
        title,
        durationSec,
        thumbnailUrl,
        channelId,
        description,
        captionsJson,
        category,
        contentType,
        hidden
      ] = values as [
        number,
        string,
        string,
        number | null,
        string | null,
        string | null,
        string | null,
        string | null,
        string | null,
        string | null,
        number | null
      ];
      const id = ++this.lastVideoId;
      const row: VideoTableRow = {
        id,
        artist_id: artistId,
        youtube_video_id: youtubeVideoId,
        title,
        duration_sec: durationSec ?? null,
        thumbnail_url: thumbnailUrl ?? null,
        channel_id: channelId ?? null,
        description: description ?? null,
        captions_json: captionsJson ?? null,
        category: category ?? null,
        content_type: contentType ?? null,
        hidden: hidden ?? 0
      };
      this.videos.push(row);
      return { success: true, meta: { duration: 0, changes: 1, last_row_id: id } };
    }
    return { success: true, meta: { duration: 0, changes: 0 } };
  }
}

const corsConfig = { origin: null, requestHeaders: null, allowPrivateNetwork: false } as const;

const baseOverrides = {
  detectFromChapterSources: async () => [
    { startSec: 0, endSec: 30, score: 0.9, label: "Intro" }
  ],
  detectFromDescription: () => [],
  detectFromCaptions: () => []
} as const;

test("clip suggestions inserts new video when url is fresh", async (t) => {
  __resetWorkerTestState();
  __setHasEnsuredVideoColumnsForTests(true);
  __setWorkerTestOverrides({
    fetchVideoMetadata: async () => ({
      title: "New Title",
      durationSec: 120,
      thumbnailUrl: "thumb",
      channelId: "channel-1",
      description: "Auto description"
    }),
    ...baseOverrides
  });
  t.after(() => __resetWorkerTestState());

  const db = new FakeD1Database([{ id: 1, created_by: 42 }]);
  const env: Env = { DB: db };
  const request = new Request("https://example.com/api/videos/clip-suggestions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ artistId: 1, videoUrl: "https://www.youtube.com/watch?v=abcdefghijk" })
  });
  const user = { id: 42, email: "user@example.com", displayName: null };

  const response = await suggestClipCandidates(request, env, user, corsConfig);
  assert.equal(response.status, 200);
  const payload = (await response.json()) as any;
  assert.equal(payload.video.youtubeVideoId, "abcdefghijk");
  assert.equal(payload.video.title, "New Title");
  assert.equal(payload.candidates.length, 1);
  assert.equal(db.videos.length, 1);
  assert.equal(db.videos[0].description, "Auto description");
});

test("clip suggestions returns existing video without creating duplicates", async (t) => {
  __resetWorkerTestState();
  __setHasEnsuredVideoColumnsForTests(true);
  __setWorkerTestOverrides({
    fetchVideoMetadata: async () => ({
      title: "Updated Title",
      durationSec: 240,
      thumbnailUrl: "thumb2",
      channelId: "channel-1",
      description: null
    }),
    ...baseOverrides
  });
  t.after(() => __resetWorkerTestState());

  const existingVideo: VideoTableRow = {
    id: 10,
    artist_id: 1,
    youtube_video_id: "abcdefghijk",
    title: "Old Title",
    duration_sec: 60,
    thumbnail_url: "thumb-old",
    channel_id: "channel-old",
    description: "old",
    captions_json: null,
    category: null,
    content_type: "OFFICIAL",
    hidden: 0
  };
  const db = new FakeD1Database([{ id: 1, created_by: 42 }], [existingVideo]);
  const env: Env = { DB: db };
  const request = new Request("https://example.com/api/videos/clip-suggestions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ artistId: 1, videoUrl: "https://www.youtube.com/watch?v=abcdefghijk" })
  });
  const user = { id: 42, email: "user@example.com", displayName: null };

  const response = await suggestClipCandidates(request, env, user, corsConfig);
  assert.equal(response.status, 200);
  const payload = (await response.json()) as any;
  assert.equal(payload.video.id, 10);
  assert.equal(payload.video.title, "Updated Title");
  assert.equal(payload.candidates.length, 1);
  assert.equal(db.videos.length, 1);
  assert.equal(db.videos[0].title, "Updated Title");
});

test("clip suggestions rejects invalid urls", async () => {
  __resetWorkerTestState();
  __setHasEnsuredVideoColumnsForTests(true);
  __setWorkerTestOverrides({
    fetchVideoMetadata: async () => ({
      title: "Ignored",
      durationSec: null,
      thumbnailUrl: null,
      channelId: null,
      description: null
    }),
    ...baseOverrides
  });

  const db = new FakeD1Database([{ id: 1, created_by: 42 }]);
  const env: Env = { DB: db };
  const request = new Request("https://example.com/api/videos/clip-suggestions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ artistId: 1, videoUrl: "https://example.com/watch" })
  });
  const user = { id: 42, email: "user@example.com", displayName: null };

  try {
    await assert.rejects(async () => {
      await suggestClipCandidates(request, env, user, corsConfig);
    }, (error: unknown) => {
      const err = error as { status?: number; message?: string };
      return err?.status === 400 && typeof err.message === "string";
    });
  } finally {
    __resetWorkerTestState();
  }
});

test("clip suggestions fails when video belongs to another artist", async () => {
  __resetWorkerTestState();
  __setHasEnsuredVideoColumnsForTests(true);
  __setWorkerTestOverrides({
    fetchVideoMetadata: async () => ({
      title: "Ignored",
      durationSec: null,
      thumbnailUrl: null,
      channelId: null,
      description: null
    }),
    ...baseOverrides
  });

  const conflictingVideo: VideoTableRow = {
    id: 5,
    artist_id: 2,
    youtube_video_id: "abcdefghijk",
    title: "Other",
    duration_sec: null,
    thumbnail_url: null,
    channel_id: null,
    description: null,
    captions_json: null,
    content_type: "OFFICIAL",
    hidden: 0
  };
  const db = new FakeD1Database(
    [
      { id: 1, created_by: 42 },
      { id: 2, created_by: 42 }
    ],
    [conflictingVideo]
  );
  const env: Env = { DB: db };
  const request = new Request("https://example.com/api/videos/clip-suggestions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ artistId: 1, videoUrl: "https://www.youtube.com/watch?v=abcdefghijk" })
  });
  const user = { id: 42, email: "user@example.com", displayName: null };

  try {
    await assert.rejects(async () => {
      await suggestClipCandidates(request, env, user, corsConfig);
    }, (error: unknown) => {
      const err = error as { status?: number; message?: string };
      return err?.status === 409;
    });
  } finally {
    __resetWorkerTestState();
  }
});
