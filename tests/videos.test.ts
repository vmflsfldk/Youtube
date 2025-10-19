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
    return null;
  }

  async handleAll<T>(query: string, values: unknown[]): Promise<D1Result<T>> {
    const normalized = query.replace(/\s+/g, " ").trim().toLowerCase();
    if (
      normalized.startsWith(
        "select * from videos where artist_id = ? and content_type = ? and hidden = 0 order by id desc"
      )
    ) {
      const [artistId, contentType] = values as [number, string];
      const rows = this.videos
        .filter((row) => row.artist_id === artistId && (row.content_type ?? "") === contentType)
        .filter((row) => Number(row.hidden ?? 0) === 0)
        .sort((a, b) => b.id - a.id)
        .map((row) => ({ ...row } as unknown as T));
      return { success: true, meta: { duration: 0, changes: 0 }, results: rows };
    }
    if (normalized.startsWith("select * from videos where artist_id = ? and hidden = 0 order by id desc")) {
      const [artistId] = values as [number];
      const rows = this.videos
        .filter((row) => row.artist_id === artistId)
        .filter((row) => Number(row.hidden ?? 0) === 0)
        .sort((a, b) => b.id - a.id)
        .map((row) => ({ ...row } as unknown as T));
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
      hidden: 0
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
});

test("listVideos allows unauthenticated access", async (t) => {
  __resetWorkerTestState();
  __setHasEnsuredVideoColumnsForTests(true);
  t.after(() => __resetWorkerTestState());

  const artists: ArtistTableRow[] = [{ id: 3, created_by: 3 }];
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
      hidden: 0
    }
  ];

  const db = new FakeD1Database(artists, videos);
  const env: Env = { DB: db };
  const url = new URL("https://example.com/api/videos?artistId=3");

  const response = await listVideos(url, env, null, corsConfig);
  assert.equal(response.status, 200);

  const payload = (await response.json()) as any[];
  assert.equal(payload.length, 1);
  assert.equal(payload[0].youtubeVideoId, "unauthvid");
});
