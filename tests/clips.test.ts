import test from "node:test";
import assert from "node:assert/strict";

import { __listClipsForTests as listClips, __resetWorkerTestState } from "../src/worker";
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

type ArtistRow = {
  id: number;
  created_by: number;
};

type VideoRow = {
  id: number;
  artist_id: number;
  youtube_video_id: string;
  title: string;
};

type ClipRow = {
  id: number;
  video_id: number;
  title: string;
  start_sec: number;
  end_sec: number;
};

type ClipTagRow = {
  clip_id: number;
  tag: string;
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
    private readonly artists: ArtistRow[],
    private readonly videos: VideoRow[],
    private readonly clips: ClipRow[],
    private readonly clipTags: ClipTagRow[]
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
      normalized.startsWith(
        "select v.id from videos v join artists a on a.id = v.artist_id where v.id = ? and a.created_by = ?"
      )
    ) {
      const [videoId, createdBy] = values as [number, number];
      const video = this.videos.find((row) => row.id === videoId);
      if (!video) {
        return null;
      }
      const artist = this.artists.find((row) => row.id === video.artist_id && row.created_by === createdBy);
      return (artist ? ({ id: video.id } as unknown as T) : null);
    }
    if (normalized.startsWith("select id from videos where id = ?")) {
      const [videoId] = values as [number];
      const video = this.videos.find((row) => row.id === videoId);
      return (video ? ({ id: video.id } as unknown as T) : null);
    }
    return null;
  }

  async handleAll<T>(query: string, values: unknown[]): Promise<D1Result<T>> {
    const normalized = query.replace(/\s+/g, " ").trim().toLowerCase();
    if (
      normalized.startsWith(
        "select c.id, c.video_id, c.title, c.start_sec, c.end_sec from clips c join videos v on v.id = c.video_id where v.artist_id = ? order by c.start_sec"
      )
    ) {
      const [artistId] = values as [number];
      const rows = this.clips
        .filter((clip) => this.videos.some((video) => video.id === clip.video_id && video.artist_id === artistId))
        .sort((a, b) => a.start_sec - b.start_sec)
        .map((clip) => ({ ...clip } as unknown as T));
      return { success: true, meta: { duration: 0, changes: 0 }, results: rows };
    }
    if (
      normalized.startsWith(
        "select id, video_id, title, start_sec, end_sec from clips where video_id = ? order by start_sec"
      )
    ) {
      const [videoId] = values as [number];
      const rows = this.clips
        .filter((clip) => clip.video_id === videoId)
        .sort((a, b) => a.start_sec - b.start_sec)
        .map((clip) => ({ ...clip } as unknown as T));
      return { success: true, meta: { duration: 0, changes: 0 }, results: rows };
    }
    if (normalized.startsWith("select clip_id, tag from clip_tags where clip_id in")) {
      const clipIds = values as number[];
      const rows = this.clipTags
        .filter((row) => clipIds.includes(row.clip_id))
        .sort((a, b) => a.tag.localeCompare(b.tag))
        .map((row) => ({ ...row } as unknown as T));
      return { success: true, meta: { duration: 0, changes: 0 }, results: rows };
    }
    if (normalized.startsWith("select id, youtube_video_id, title from videos where id in")) {
      const videoIds = values as number[];
      const rows = this.videos
        .filter((video) => videoIds.includes(video.id))
        .map((video) => ({ ...video } as unknown as T));
      return { success: true, meta: { duration: 0, changes: 0 }, results: rows };
    }
    return { success: true, meta: { duration: 0, changes: 0 }, results: [] };
  }

  async handleRun<T>(_query: string, _values: unknown[]): Promise<D1Result<T>> {
    return { success: true, meta: { duration: 0, changes: 0 } };
  }
}

const corsConfig = { origin: null, requestHeaders: null, allowPrivateNetwork: false } as const;

test("listClips allows access to clips for another user's artist", async (t) => {
  __resetWorkerTestState();
  t.after(() => __resetWorkerTestState());

  const artists: ArtistRow[] = [
    { id: 1, created_by: 1 },
    { id: 2, created_by: 2 }
  ];
  const videos: VideoRow[] = [
    { id: 201, artist_id: 2, youtube_video_id: "video201", title: "Collab" }
  ];
  const clips: ClipRow[] = [
    { id: 501, video_id: 201, title: "Best Part", start_sec: 30, end_sec: 60 }
  ];
  const clipTags: ClipTagRow[] = [
    { clip_id: 501, tag: "chorus" }
  ];

  const db = new FakeD1Database(artists, videos, clips, clipTags);
  const env: Env = { DB: db };
  const user = { id: 1, email: "user1@example.com", displayName: null };
  const url = new URL("https://example.com/api/clips?artistId=2");

  const response = await listClips(url, env, user, corsConfig);
  assert.equal(response.status, 200);

  const payload = (await response.json()) as any[];
  assert.equal(payload.length, 1);
  assert.equal(payload[0].id, 501);
  assert.equal(payload[0].videoId, 201);
  assert.deepEqual(payload[0].tags, ["chorus"]);
  assert.equal(payload[0].youtubeVideoId, "video201");
});

test("listClips allows access to clips for another user's video", async (t) => {
  __resetWorkerTestState();
  t.after(() => __resetWorkerTestState());

  const artists: ArtistRow[] = [
    { id: 1, created_by: 1 },
    { id: 2, created_by: 2 }
  ];
  const videos: VideoRow[] = [
    { id: 202, artist_id: 2, youtube_video_id: "video202", title: "Duet" }
  ];
  const clips: ClipRow[] = [
    { id: 601, video_id: 202, title: "Highlight", start_sec: 45, end_sec: 75 }
  ];
  const clipTags: ClipTagRow[] = [];

  const db = new FakeD1Database(artists, videos, clips, clipTags);
  const env: Env = { DB: db };
  const user = { id: 1, email: "user1@example.com", displayName: null };
  const url = new URL("https://example.com/api/clips?videoId=202");

  const response = await listClips(url, env, user, corsConfig);
  assert.equal(response.status, 200);

  const payload = (await response.json()) as any[];
  assert.equal(payload.length, 1);
  assert.equal(payload[0].id, 601);
  assert.equal(payload[0].videoId, 202);
  assert.equal(payload[0].youtubeVideoId, "video202");
});
