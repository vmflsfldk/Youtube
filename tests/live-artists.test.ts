import test from "node:test";
import assert from "node:assert/strict";

import {
  __listLiveArtistsForTests as listLiveArtists,
  __resetWorkerTestState,
  __setWorkerTestOverrides,
  __setHasEnsuredVideoColumnsForTests
} from "../src/worker";
import type { Env } from "../src/worker";

type D1Result<T> = {
  success: boolean;
  error?: string;
  results?: T[];
  meta: {
    duration: number;
    changes: number;
    last_row_id?: number;
  };
};

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run<T = unknown>(): Promise<D1Result<T>>;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type ArtistRow = {
  id: number;
  name: string;
  display_name: string | null;
  youtube_channel_id: string;
  youtube_channel_title: string | null;
  profile_image_url: string | null;
  available_ko: number;
  available_en: number;
  available_jp: number;
  agency: string | null;
};

type LiveBroadcastVideo = {
  videoId: string;
  title: string | null;
  url: string;
  thumbnailUrl: string | null;
  startedAt: string | null;
  scheduledStartAt: string | null;
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
  private readonly artists: ArtistRow[] = [];
  private readonly tags = new Map<number, Set<string>>();

  constructor(initialArtists: ArtistRow[] = [], initialTags: Record<number, string[]> = {}) {
    for (const artist of initialArtists) {
      this.artists.push({ ...artist });
      const seeded = new Set<string>();
      const tagList = initialTags[artist.id] ?? [];
      for (const tag of tagList) {
        if (typeof tag === "string" && tag.trim()) {
          seeded.add(tag);
        }
      }
      this.tags.set(artist.id, seeded);
    }
  }

  prepare(query: string): D1PreparedStatement {
    return new FakeStatement(this, query);
  }

  async handleFirst<T>(_query: string, _values: unknown[]): Promise<T | null> {
    return null;
  }

  async handleAll<T>(query: string, _values: unknown[]): Promise<D1Result<T>> {
    const normalized = query.replace(/\s+/g, " ").trim().toLowerCase();
    if (
      normalized.startsWith("select a.id") &&
      normalized.includes("from artists a") &&
      normalized.includes("group_concat(at.tag")
    ) {
      const rows = this.artists
        .slice()
        .sort((a, b) => b.id - a.id)
        .map((artist) => ({
          id: artist.id,
          name: artist.name,
          display_name: artist.display_name,
          youtube_channel_id: artist.youtube_channel_id,
          youtube_channel_title: artist.youtube_channel_title,
          profile_image_url: artist.profile_image_url,
          available_ko: artist.available_ko,
          available_en: artist.available_en,
          available_jp: artist.available_jp,
          agency: artist.agency,
          tags: this.serializeTags(artist.id)
        } as unknown as T));
      return { success: true, meta: { duration: 0, changes: 0 }, results: rows };
    }

    return { success: true, meta: { duration: 0, changes: 0 }, results: [] };
  }

  async handleRun<T>(_query: string, _values: unknown[]): Promise<D1Result<T>> {
    return { success: true, meta: { duration: 0, changes: 0 } } as D1Result<T>;
  }

  private serializeTags(id: number): string | null {
    const tags = Array.from(this.tags.get(id)?.values() ?? []);
    if (tags.length === 0) {
      return null;
    }
    return tags.join(String.fromCharCode(31));
  }
}

const cors = { origin: null, requestHeaders: null, allowPrivateNetwork: false } as const;

const user = { id: 1, email: "user@example.com", displayName: "Test User" } as const;

test("listLiveArtists returns live broadcast metadata from overrides", async () => {
  __resetWorkerTestState();
  __setHasEnsuredVideoColumnsForTests(true);

  const liveMap = new Map<string, LiveBroadcastVideo[]>([
    [
      "UCALPHA",
      [
        {
          videoId: "live-alpha-1",
          title: "Alpha is Live!",
          url: "https://youtu.be/live-alpha-1",
          thumbnailUrl: "https://example.com/live-alpha-1.jpg",
          startedAt: "2024-05-02T12:00:00.000Z",
          scheduledStartAt: null
        },
        {
          videoId: "live-alpha-2",
          title: null,
          url: "https://youtu.be/live-alpha-2",
          thumbnailUrl: null,
          startedAt: null,
          scheduledStartAt: "2024-05-03T09:00:00.000Z"
        }
      ]
    ],
    [
      "UCBETA",
      [
        {
          videoId: "live-beta-1",
          title: "Beta Morning Stream",
          url: "https://youtu.be/live-beta-1",
          thumbnailUrl: "https://example.com/live-beta.jpg",
          startedAt: null,
          scheduledStartAt: "2024-05-04T01:30:00.000Z"
        }
      ]
    ]
  ]);

  const requestedChannels: Array<string | null> = [];

  __setWorkerTestOverrides({
    fetchLiveBroadcastsForChannel: async (_env, channelId) => {
      requestedChannels.push(channelId ?? null);
      const key = typeof channelId === "string" ? channelId.trim() : "";
      return liveMap.get(key) ?? [];
    }
  });

  const db = new FakeD1Database(
    [
      {
        id: 10,
        name: "Alpha",
        display_name: "Alpha",
        youtube_channel_id: "UCALPHA",
        youtube_channel_title: "Alpha Channel",
        profile_image_url: "https://example.com/alpha.png",
        available_ko: 1,
        available_en: 0,
        available_jp: 1,
        agency: "Agency A"
      },
      {
        id: 20,
        name: "Beta",
        display_name: "Beta",
        youtube_channel_id: "UCBETA",
        youtube_channel_title: "Beta Channel",
        profile_image_url: "https://example.com/beta.png",
        available_ko: 0,
        available_en: 1,
        available_jp: 0,
        agency: null
      }
    ],
    {
      10: ["utaite"],
      20: ["cover", "idol"]
    }
  );

  const env: Env = { DB: db };
  const response = await listLiveArtists(env, user as unknown as Parameters<typeof listLiveArtists>[1], cors);
  assert.equal(response.status, 200);

  const payload = (await response.json()) as Array<{
    artist: { id: number; youtubeChannelId: string; name: string; tags: string[] };
    liveVideos: Array<{
      videoId: string;
      title: string | null;
      url: string | null;
      startedAt: string | null;
      scheduledStartAt: string | null;
    }>;
  }>;

  assert.deepEqual(requestedChannels, ["UCBETA", "UCALPHA"]);
  assert.equal(payload.length, 2);

  const [beta, alpha] = payload;
  assert.equal(beta.artist.id, 20);
  assert.deepEqual(beta.artist.tags, ["cover", "idol"]);
  assert.equal(beta.liveVideos.length, 1);
  assert.equal(beta.liveVideos[0].videoId, "live-beta-1");
  assert.equal(beta.liveVideos[0].scheduledStartAt, "2024-05-04T01:30:00.000Z");

  assert.equal(alpha.artist.id, 10);
  assert.deepEqual(alpha.artist.tags, ["utaite"]);
  assert.equal(alpha.liveVideos.length, 2);
  assert.equal(alpha.liveVideos[0].videoId, "live-alpha-1");
  assert.equal(alpha.liveVideos[0].startedAt, "2024-05-02T12:00:00.000Z");
  assert.equal(alpha.liveVideos[1].videoId, "live-alpha-2");
  assert.equal(alpha.liveVideos[1].scheduledStartAt, "2024-05-03T09:00:00.000Z");
});
