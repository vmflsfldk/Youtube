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
  original_composer: string | null;
};

type ArtistTableRow = {
  id: number;
  created_by: number;
};

type VideoArtistLink = {
  video_id: number;
  artist_id: number;
  is_primary: number;
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
  readonly videoArtists: VideoArtistLink[];

  constructor(
    readonly artists: ArtistTableRow[],
    readonly videos: VideoTableRow[] = [],
    videoArtists?: VideoArtistLink[]
  ) {
    this.lastVideoId = videos.reduce((max, row) => Math.max(max, row.id), 0);
    this.videoArtists = (videoArtists ?? []).map((link) => ({ ...link }));
    if (!videoArtists) {
      for (const video of videos) {
        this.videoArtists.push({ video_id: video.id, artist_id: video.artist_id, is_primary: 1 });
      }
    }
  }

  prepare(query: string): D1PreparedStatement {
    return new FakeStatement(this, query);
  }

  async handleFirst<T>(query: string, values: unknown[]): Promise<T | null> {
    const normalized = query.replace(/\s+/g, " ").trim().toLowerCase();
    if (normalized.startsWith("select id from artists")) {
      if (normalized.includes("created_by = ?")) {
        const [artistId, createdBy] = values as [number, number];
        const artist = this.artists.find((row) => row.id === artistId && row.created_by === createdBy);
        return (artist ? ({ id: artist.id } as unknown as T) : null);
      }
      const [artistId] = values as [number];
      const artist = this.artists.find((row) => row.id === artistId);
      return (artist ? ({ id: artist.id } as unknown as T) : null);
    }
    if (normalized.startsWith("select * from videos where youtube_video_id = ?")) {
      const [youtubeVideoId] = values as [string];
      const video = this.videos.find((row) => row.youtube_video_id === youtubeVideoId);
      return (video ? ({ ...video } as unknown as T) : null);
    }
    if (normalized.startsWith("select 1 from video_artists where video_id = ? and artist_id = ?")) {
      const [videoId, artistId] = values as [number, number];
      const found = this.videoArtists.some(
        (link) => link.video_id === videoId && link.artist_id === artistId
      );
      return (found ? ({ 1: 1 } as unknown as T) : null);
    }
    if (normalized.startsWith("select * from videos where id =")) {
      const [videoId] = values as [number];
      const video = this.videos.find((row) => row.id === videoId);
      return (video ? ({ ...video } as unknown as T) : null);
    }
    return null;
  }

  async handleAll<T>(query: string, values: unknown[]): Promise<D1Result<T>> {
    const normalized = query.replace(/\s+/g, " ").trim().toLowerCase();
    if (
      normalized.startsWith("select va.video_id, va.artist_id, va.is_primary") &&
      normalized.includes("from video_artists va join artists a on a.id = va.artist_id")
    ) {
      const videoIds = values as number[];
      const rows = this.videoArtists
        .filter((link) => videoIds.includes(link.video_id))
        .map((link) => {
          const artist = this.artists.find((row) => row.id === link.artist_id);
          if (!artist) {
            return null;
          }
          return {
            video_id: link.video_id,
            artist_id: link.artist_id,
            is_primary: link.is_primary,
            name: "",
            display_name: null,
            youtube_channel_id: "",
            youtube_channel_title: null,
            profile_image_url: null
          } as unknown as T;
        })
        .filter((row): row is T => row !== null)
        .sort((a, b) => {
          const left = a as unknown as { video_id: number; is_primary: number; artist_id: number };
          const right = b as unknown as { video_id: number; is_primary: number; artist_id: number };
          if (left.video_id !== right.video_id) {
            return left.video_id - right.video_id;
          }
          if (right.is_primary !== left.is_primary) {
            return right.is_primary - left.is_primary;
          }
          return left.artist_id - right.artist_id;
        });
      return { success: true, meta: { duration: 0, changes: 0 }, results: rows };
    }
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
        originalComposer,
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
      video.original_composer = originalComposer ?? null;
      video.content_type = contentType ?? null;
      video.hidden = hidden ?? 0;
      return { success: true, meta: { duration: 0, changes: 1 } };
    }
    if (normalized.startsWith("insert into video_artists")) {
      const [videoId, artistId, isPrimary] = values as [number, number, number];
      const existing = this.videoArtists.find(
        (link) => link.video_id === videoId && link.artist_id === artistId
      );
      if (existing) {
        existing.is_primary = Number(isPrimary);
      } else {
        this.videoArtists.push({ video_id: videoId, artist_id: artistId, is_primary: Number(isPrimary) });
      }
      return { success: true, meta: { duration: 0, changes: 1 } };
    }
    if (
      normalized.startsWith(
        "update video_artists set is_primary = case when artist_id = ? then 1 else 0 end where video_id = ?"
      )
    ) {
      const [artistId, videoId] = values as [number, number];
      for (const link of this.videoArtists) {
        if (link.video_id === videoId) {
          link.is_primary = link.artist_id === artistId ? 1 : 0;
        }
      }
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
        originalComposer,
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
        original_composer: originalComposer ?? null,
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
    body: JSON.stringify({
      artistId: 1,
      videoUrl: "https://www.youtube.com/watch?v=abcdefghijk",
      category: "Cover"
    })
  });
  const user = { id: 42, email: "user@example.com", displayName: null };

  const response = await suggestClipCandidates(request, env, user, corsConfig);
  assert.equal(response.status, 200);
  const payload = (await response.json()) as any;
  assert.equal(payload.video.youtubeVideoId, "abcdefghijk");
  assert.equal(payload.video.title, "New Title");
  assert.equal(payload.video.category, "cover");
  assert.equal(payload.candidates.length, 1);
  assert.equal(db.videos.length, 1);
  assert.equal(db.videos[0].description, "Auto description");
  assert.equal(db.videos[0].category, "cover");
});

test("clip suggestions allows registering videos for artists created by other users", async (t) => {
  __resetWorkerTestState();
  __setHasEnsuredVideoColumnsForTests(true);
  __setWorkerTestOverrides({
    fetchVideoMetadata: async () => ({
      title: "Collab Song",
      durationSec: 210,
      thumbnailUrl: "thumb",
      channelId: "channel-2",
      description: "Auto description"
    }),
    ...baseOverrides
  });
  t.after(() => __resetWorkerTestState());

  const db = new FakeD1Database([{ id: 2, created_by: 99 }]);
  const env: Env = { DB: db };
  const request = new Request("https://example.com/api/videos/clip-suggestions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ artistId: 2, videoUrl: "https://www.youtube.com/watch?v=zyxwvutsrqp" })
  });
  const user = { id: 42, email: "user@example.com", displayName: null };

  const response = await suggestClipCandidates(request, env, user, corsConfig);
  assert.equal(response.status, 200);
  const payload = (await response.json()) as any;
  assert.equal(payload.video.youtubeVideoId, "zyxwvutsrqp");
  assert.equal(payload.video.title, "Collab Song");
  assert.equal(db.videos.length, 1);
  assert.equal(db.videos[0].artist_id, 2);
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
    hidden: 0,
    original_composer: null
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

test("clip suggestions updates category when provided", async (t) => {
  __resetWorkerTestState();
  __setHasEnsuredVideoColumnsForTests(true);
  __setWorkerTestOverrides({
    fetchVideoMetadata: async () => ({
      title: "Cover Song",
      durationSec: 180,
      thumbnailUrl: "thumb",
      channelId: "channel",
      description: null
    }),
    ...baseOverrides
  });
  t.after(() => __resetWorkerTestState());

  const youtubeVideoId = "covervideo1";

  const existingVideo: VideoTableRow = {
    id: 20,
    artist_id: 3,
    youtube_video_id: youtubeVideoId,
    title: "Old Title",
    duration_sec: 150,
    thumbnail_url: "thumb-old",
    channel_id: "channel-old",
    description: null,
    captions_json: null,
    category: "live",
    content_type: "OFFICIAL",
    hidden: 0,
    original_composer: null
  };

  const db = new FakeD1Database([{ id: 3, created_by: 7 }], [existingVideo]);
  const env: Env = { DB: db };
  const request = new Request("https://example.com/api/videos/clip-suggestions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      artistId: 3,
      videoUrl: `https://www.youtube.com/watch?v=${youtubeVideoId}`,
      category: "cover"
    })
  });
  const user = { id: 7, email: "owner@example.com", displayName: null };

  const response = await suggestClipCandidates(request, env, user, corsConfig);
  assert.equal(response.status, 200);
  const payload = (await response.json()) as any;
  assert.equal(payload.video.category, "cover");
  assert.equal(db.videos[0].category, "cover");
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

test("clip suggestions links existing videos to additional artists", async () => {
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
    category: null,
    original_composer: null,
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
    const response = await suggestClipCandidates(request, env, user, corsConfig);
    assert.equal(response.status, 200);
    const payload = (await response.json()) as any;
    assert.equal(payload.video.youtubeVideoId, "abcdefghijk");
    const links = db.videoArtists.filter((link) => link.video_id === conflictingVideo.id);
    assert.equal(links.length, 2);
    assert(links.some((link) => link.artist_id === 1 && link.is_primary === 0));
    assert(links.some((link) => link.artist_id === 2 && link.is_primary === 1));
  } finally {
    __resetWorkerTestState();
  }
});
