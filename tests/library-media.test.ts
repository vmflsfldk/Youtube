import test from "node:test";
import assert from "node:assert/strict";

import {
  __listMediaLibraryForTests as listMediaLibrary,
  __setHasEnsuredVideoColumnsForTests,
  __resetWorkerTestState
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

type ArtistRecord = {
  id: number;
  created_by: number;
  name: string;
  display_name: string | null;
  youtube_channel_id: string;
  youtube_channel_title: string | null;
  profile_image_url: string | null;
};

type VideoRecord = {
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

type ClipRecord = {
  id: number;
  video_id: number;
  title: string;
  start_sec: number;
  end_sec: number;
};

type ClipTagRecord = {
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
    private readonly artists: ArtistRecord[],
    private readonly videos: VideoRecord[],
    private readonly clips: ClipRecord[],
    private readonly clipTags: ClipTagRecord[]
  ) {}

  prepare(query: string): D1PreparedStatement {
    return new FakeStatement(this, query);
  }

  async handleFirst<T>(query: string, values: unknown[]): Promise<T | null> {
    const result = await this.handleAll<T>(query, values);
    const first = result.results?.[0];
    return (first ?? null) as T | null;
  }

  async handleAll<T>(query: string, values: unknown[]): Promise<D1Result<T>> {
    const normalized = query.replace(/\s+/g, " ").trim().toLowerCase();

    if (normalized.startsWith("select v.id, v.artist_id") && normalized.includes("from videos v join artists a")) {
      const [createdBy] = values as [number];
      const rows = this.videos
        .map((video) => {
          const artist = this.artists.find((item) => item.id === video.artist_id);
          return artist && artist.created_by === createdBy
            ? ({
                ...video,
                artist_name: artist.name,
                artist_display_name: artist.display_name,
                artist_youtube_channel_id: artist.youtube_channel_id,
                artist_youtube_channel_title: artist.youtube_channel_title,
                artist_profile_image_url: artist.profile_image_url
              } as unknown as T)
            : null;
        })
        .filter((row): row is T => row !== null)
        .sort((a, b) => (b as unknown as { id: number }).id - (a as unknown as { id: number }).id);
      return { success: true, meta: { duration: 0, changes: 0 }, results: rows };
    }

    if (normalized.startsWith("select id, video_id, title, start_sec, end_sec from clips where video_id in")) {
      const ids = new Set((values as number[]) ?? []);
      const rows = this.clips
        .filter((clip) => ids.has(clip.video_id))
        .sort((a, b) => {
          if (a.video_id !== b.video_id) {
            return a.video_id - b.video_id;
          }
          return a.start_sec - b.start_sec;
        })
        .map((clip) => ({ ...clip } as unknown as T));
      return { success: true, meta: { duration: 0, changes: 0 }, results: rows };
    }

    if (normalized.startsWith("select clip_id, tag from clip_tags where clip_id in")) {
      const ids = new Set((values as number[]) ?? []);
      const rows = this.clipTags
        .filter((tag) => ids.has(tag.clip_id))
        .sort((a, b) => a.tag.localeCompare(b.tag))
        .map((tag) => ({ ...tag } as unknown as T));
      return { success: true, meta: { duration: 0, changes: 0 }, results: rows };
    }

    if (normalized.startsWith("select id, youtube_video_id, title from videos where id in")) {
      const ids = new Set((values as number[]) ?? []);
      const rows = this.videos
        .filter((video) => ids.has(video.id))
        .map((video) => ({
          id: video.id,
          youtube_video_id: video.youtube_video_id,
          title: video.title
        } as unknown as T));
      return { success: true, meta: { duration: 0, changes: 0 }, results: rows };
    }

    return { success: true, meta: { duration: 0, changes: 0 }, results: [] };
  }

  async handleRun<T>(_query: string, _values: unknown[]): Promise<D1Result<T>> {
    return { success: true, meta: { duration: 0, changes: 0 } };
  }
}

const cors = { origin: null, requestHeaders: null, allowPrivateNetwork: false };

test("listMediaLibrary returns media and clips for requesting user", async () => {
  __resetWorkerTestState();
  __setHasEnsuredVideoColumnsForTests(true);

  const db = new FakeD1Database(
    [
      {
        id: 10,
        created_by: 1,
        name: "Artist One",
        display_name: "Artist 1",
        youtube_channel_id: "chan-1",
        youtube_channel_title: "Channel One",
        profile_image_url: "https://example.com/artist1.png"
      },
      {
        id: 20,
        created_by: 2,
        name: "Other Artist",
        display_name: "Other",
        youtube_channel_id: "chan-2",
        youtube_channel_title: "Channel Two",
        profile_image_url: "https://example.com/artist2.png"
      }
    ],
    [
      {
        id: 1,
        artist_id: 10,
        youtube_video_id: "videoaaaaaa1",
        title: "First Video",
        duration_sec: 180,
        thumbnail_url: "https://example.com/thumb1.jpg",
        channel_id: "channel-1",
        description: null,
        captions_json: null,
        category: "live",
        content_type: "OFFICIAL",
        hidden: 0
      },
      {
        id: 2,
        artist_id: 10,
        youtube_video_id: "videobbbbbbb2",
        title: "Second Video",
        duration_sec: 200,
        thumbnail_url: "https://example.com/thumb2.jpg",
        channel_id: "channel-1",
        description: null,
        captions_json: null,
        category: "cover",
        content_type: "CLIP_SOURCE",
        hidden: 0
      },
      {
        id: 3,
        artist_id: 20,
        youtube_video_id: "videoccccccc3",
        title: "Third Video",
        duration_sec: 210,
        thumbnail_url: null,
        channel_id: null,
        description: null,
        captions_json: null,
        category: null,
        content_type: "OFFICIAL",
        hidden: 0
      }
    ],
    [
      { id: 101, video_id: 1, title: "Intro", start_sec: 0, end_sec: 30 },
      { id: 102, video_id: 2, title: "Chorus", start_sec: 45, end_sec: 75 },
      { id: 103, video_id: 3, title: "Other Artist Clip", start_sec: 10, end_sec: 40 }
    ],
    [
      { clip_id: 101, tag: "tag-a" },
      { clip_id: 101, tag: "tag-b" },
      { clip_id: 102, tag: "tag-c" },
      { clip_id: 103, tag: "tag-x" }
    ]
  );

  const env: Env = { DB: db };

  const response = await listMediaLibrary(env, { id: 1, email: "owner@example.com", displayName: "Owner" }, cors);
  assert.equal(response.status, 200);

  const payload = (await response.json()) as {
    videos: Array<{
      id: number;
      artistId: number;
      artistName?: string;
      artistDisplayName?: string;
      artistYoutubeChannelId?: string;
      artistYoutubeChannelTitle?: string | null;
      artistProfileImageUrl?: string | null;
    }>;
    clips: Array<{
      id: number;
      videoId: number;
      artistId?: number;
      artistName?: string;
      tags: string[];
      youtubeVideoId?: string;
      videoTitle?: string | null;
    }>;
  };

  assert.equal(payload.videos.length, 2);
  assert.deepEqual(
    payload.videos.map((video) => video.id),
    [2, 1],
    "videos should be ordered by id desc"
  );
  assert.deepEqual(
    payload.videos.map((video) => video.artistName),
    ["Artist One", "Artist One"]
  );
  assert.deepEqual(
    payload.videos.map((video) => video.artistYoutubeChannelId),
    ["chan-1", "chan-1"]
  );

  assert.equal(payload.clips.length, 2);
  const clipIds = payload.clips.map((clip) => clip.id).sort((a, b) => a - b);
  assert.deepEqual(clipIds, [101, 102]);
  const chorusClip = payload.clips.find((clip) => clip.id === 102);
  assert(chorusClip);
  assert.equal(chorusClip?.artistId, 10);
  assert.equal(chorusClip?.artistName, "Artist One");
  assert.equal(chorusClip?.youtubeVideoId, "videobbbbbbb2");
  assert.equal(chorusClip?.videoTitle, "Second Video");
  assert.deepEqual(chorusClip?.tags, ["tag-c"]);
});

test("listMediaLibrary throws for unauthenticated requests", async () => {
  __resetWorkerTestState();
  __setHasEnsuredVideoColumnsForTests(true);

  const db = new FakeD1Database([], [], [], []);
  const env: Env = { DB: db };

  await assert.rejects(
    () => listMediaLibrary(env, null, cors),
    (error: unknown) => {
      if (!(error instanceof Error)) {
        return false;
      }
      return (error as { status?: number }).status === 401 && error.message === "Authentication required";
    }
  );
});
