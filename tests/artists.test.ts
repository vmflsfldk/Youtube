import test from "node:test";
import assert from "node:assert/strict";

import worker, {
  __createArtistForTests as createArtist,
  __listArtistsForTests as listArtists,
  __resetWorkerTestState,
  __setWorkerTestOverrides,
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
  name: string;
  display_name: string | null;
  youtube_channel_id: string;
  youtube_channel_title: string | null;
  profile_image_url: string | null;
  available_ko: number;
  available_en: number;
  available_jp: number;
  agency: string | null;
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
  private readonly artists: ArtistTableRow[] = [];
  private readonly tags = new Map<number, Set<string>>();
  private lastArtistId = 0;

  constructor(initialArtists: ArtistTableRow[] = [], initialTags: Record<number, string[]> = {}) {
    for (const artist of initialArtists) {
      this.artists.push({ ...artist });
      this.lastArtistId = Math.max(this.lastArtistId, artist.id);
      const seeded = new Set<string>();
      const tagList = initialTags[artist.id] ?? [];
      for (const tag of tagList) {
        seeded.add(tag);
      }
      this.tags.set(artist.id, seeded);
    }
  }

  prepare(query: string): D1PreparedStatement {
    return new FakeStatement(this, query);
  }

  getArtist(id: number): ArtistTableRow | null {
    const artist = this.artists.find((row) => row.id === id);
    return artist ? { ...artist } : null;
  }

  getTags(id: number): string[] {
    return Array.from(this.tags.get(id)?.values() ?? []);
  }

  async handleFirst<T>(query: string, values: unknown[]): Promise<T | null> {
    const normalized = query.replace(/\s+/g, " ").trim().toLowerCase();
    if (normalized.startsWith("select id from artists where youtube_channel_id")) {
      const [channelId] = values as [string];
      const artist = this.artists.find((row) => row.youtube_channel_id === channelId);
      return (artist ? ({ id: artist.id } as unknown as T) : null);
    }
    return null;
  }

  async handleAll<T>(query: string, _values: unknown[]): Promise<D1Result<T>> {
    const normalized = query.replace(/\s+/g, " ").trim().toLowerCase();
    if (
      normalized.startsWith("select a.id") &&
      normalized.includes("from artists a left join artist_tags at on at.artist_id = a.id")
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

  async handleRun<T>(query: string, values: unknown[]): Promise<D1Result<T>> {
    const normalized = query.replace(/\s+/g, " ").trim().toLowerCase();
    if (normalized.startsWith("insert into artists")) {
      const toFlag = (value: unknown): number => (Number(value) === 1 ? 1 : 0);
      const [
        name,
        displayName,
        youtubeChannelId,
        youtubeChannelTitle,
        availableKo,
        availableEn,
        availableJp,
        agency,
        createdBy
      ] = values as [
        string,
        string,
        string,
        string | null,
        number,
        number,
        number,
        string | null,
        number
      ];
      const id = ++this.lastArtistId;
      this.artists.push({
        id,
        name,
        display_name: displayName,
        youtube_channel_id: youtubeChannelId,
        youtube_channel_title: youtubeChannelTitle ?? null,
        profile_image_url: null,
        available_ko: toFlag(availableKo),
        available_en: toFlag(availableEn),
        available_jp: toFlag(availableJp),
        agency: agency ?? null,
        created_by: createdBy
      });
      this.tags.set(id, new Set());
      return { success: true, meta: { duration: 0, changes: 1, last_row_id: id } };
    }

    if (normalized.startsWith("update artists set profile_image_url")) {
      const [profileImageUrl, artistId] = values as [string, number];
      const artist = this.artists.find((row) => row.id === artistId);
      if (!artist) {
        return { success: false, error: "Artist not found", meta: { duration: 0, changes: 0 } };
      }
      artist.profile_image_url = profileImageUrl;
      return { success: true, meta: { duration: 0, changes: 1 } };
    }

    if (normalized.startsWith("insert or ignore into artist_tags")) {
      const [artistId, tag] = values as [number, string];
      let tagSet = this.tags.get(artistId);
      if (!tagSet) {
        tagSet = new Set();
        this.tags.set(artistId, tagSet);
      }
      const before = tagSet.size;
      tagSet.add(tag);
      const changes = tagSet.size === before ? 0 : 1;
      return { success: true, meta: { duration: 0, changes } };
    }

    return { success: true, meta: { duration: 0, changes: 0 } };
  }

  private serializeTags(artistId: number): string | null {
    const tagSet = this.tags.get(artistId);
    if (!tagSet || tagSet.size === 0) {
      return null;
    }
    return Array.from(tagSet.values())
      .sort((a, b) => a.localeCompare(b))
      .join(String.fromCharCode(31));
  }
}

const normalizeQuery = (query: string): string => query.replace(/\s+/g, " ").trim().toLowerCase();

class BootstrappingStatement implements D1PreparedStatement {
  private values: unknown[] = [];

  constructor(private readonly db: BootstrappingD1Database, private readonly query: string) {}

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

class BootstrappingD1Database implements D1Database {
  artistTagsTableCreated = false;
  artistTagsIndexCreated = false;

  prepare(query: string): D1PreparedStatement {
    return new BootstrappingStatement(this, query);
  }

  async handleRun<T>(query: string, _values: unknown[]): Promise<D1Result<T>> {
    const normalized = normalizeQuery(query);
    if (normalized.startsWith("create table if not exists artist_tags")) {
      this.artistTagsTableCreated = true;
    }
    if (normalized.startsWith("create index if not exists idx_artist_tags_tag")) {
      this.artistTagsIndexCreated = true;
    }
    return { success: true, meta: { duration: 0, changes: 0 } };
  }

  async handleAll<T>(query: string, _values: unknown[]): Promise<D1Result<T>> {
    const normalized = normalizeQuery(query);
    if (normalized.startsWith("pragma table_info")) {
      return { success: true, meta: { duration: 0, changes: 0 }, results: [] };
    }
    if (normalized.includes("from artists a left join artist_tags at on at.artist_id = a.id")) {
      if (!this.artistTagsTableCreated) {
        throw new Error("artist_tags table was not created");
      }
      return { success: true, meta: { duration: 0, changes: 0 }, results: [] };
    }
    return { success: true, meta: { duration: 0, changes: 0 }, results: [] };
  }

  async handleFirst<T>(_query: string, _values: unknown[]): Promise<T | null> {
    return null;
  }
}

const cors = { origin: null, requestHeaders: null, allowPrivateNetwork: false };

const createChannelMetadata = (channelId: string) => ({
  title: "Sample Channel",
  profileImageUrl: "https://example.com/channel.png",
  channelId,
  debug: {
    input: channelId,
    identifier: { channelId, username: null, handle: null },
    htmlCandidates: [],
    attemptedHtml: false,
    attemptedApi: false,
    apiStatus: 200,
    usedHtmlFallback: false,
    usedApi: true,
    htmlChannelId: null,
    htmlTitle: null,
    htmlThumbnail: null,
    resolvedChannelId: channelId,
    warnings: [],
    videoFetchAttempted: false,
    videoFetchStatus: null,
    videoFilterKeywords: [],
    filteredVideoCount: 0,
    videoFetchError: null
  }
});

test("createArtist stores availability, agency, and tags", async () => {
  __resetWorkerTestState();
  __setHasEnsuredVideoColumnsForTests(true);
  __setWorkerTestOverrides({
    fetchChannelMetadata: async (_env, channelId) => createChannelMetadata(channelId.toUpperCase())
  });

  const db = new FakeD1Database();
  const env: Env = { DB: db };
  const user = { id: 42, email: "tester@example.com", displayName: "Tester" };
  const request = new Request("https://example.com/api/artists", {
    method: "POST",
    body: JSON.stringify({
      name: "Test Artist",
      displayName: "Display",
      youtubeChannelId: "ucartist",
      availableKo: true,
      availableEn: false,
      availableJp: "1",
      agency: "Test Agency",
      tags: ["  idol  ", "IDOL", " utaite ", ""]
    })
  });

  const response = await createArtist(request, env, user, cors);
  assert.equal(response.status, 201);
  const payload = (await response.json()) as {
    id: number;
    availableKo: boolean;
    availableEn: boolean;
    availableJp: boolean;
    agency: string | null;
    tags: string[];
    youtubeChannelId: string;
    profileImageUrl: string | null;
  };

  assert.equal(payload.availableKo, true);
  assert.equal(payload.availableEn, false);
  assert.equal(payload.availableJp, true);
  assert.equal(payload.agency, "Test Agency");
  assert.deepEqual(payload.tags, ["idol", "utaite"]);
  assert.equal(payload.youtubeChannelId, "UCARTIST");
  assert.equal(payload.profileImageUrl, "https://example.com/channel.png");

  const stored = db.getArtist(payload.id);
  assert.ok(stored);
  assert.equal(stored?.available_ko, 1);
  assert.equal(stored?.available_en, 0);
  assert.equal(stored?.available_jp, 1);
  assert.equal(stored?.agency, "Test Agency");
  assert.deepEqual(db.getTags(payload.id).sort(), ["idol", "utaite"]);
});

test("listArtists returns aggregated tags and availability flags", async () => {
  __resetWorkerTestState();
  __setHasEnsuredVideoColumnsForTests(true);
  __setWorkerTestOverrides({
    fetchChannelMetadata: async (_env, channelId) => createChannelMetadata(channelId)
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
        agency: "Agency A",
        created_by: 1
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
        agency: null,
        created_by: 2
      }
    ],
    {
      10: ["utaite", "idol"],
      20: ["cover"]
    }
  );

  const env: Env = { DB: db };
  const url = new URL("https://example.com/api/artists");
  const response = await listArtists(url, env, null, cors);
  assert.equal(response.status, 200);
  const artists = (await response.json()) as Array<{
    id: number;
    availableKo: boolean;
    availableEn: boolean;
    availableJp: boolean;
    agency: string | null;
    tags: string[];
  }>;

  assert.equal(artists.length, 2);
  assert.equal(artists[0].id, 20);
  assert.deepEqual(artists[0].tags, ["cover"]);
  assert.equal(artists[0].availableKo, false);
  assert.equal(artists[0].availableEn, true);
  assert.equal(artists[0].availableJp, false);
  assert.equal(artists[0].agency, null);

  assert.equal(artists[1].id, 10);
  assert.deepEqual(artists[1].tags, ["idol", "utaite"]);
  assert.equal(artists[1].availableKo, true);
  assert.equal(artists[1].availableEn, false);
  assert.equal(artists[1].availableJp, true);
  assert.equal(artists[1].agency, "Agency A");
});

test("listArtists bootstraps artist_tags schema", async () => {
  __resetWorkerTestState();

  const db = new BootstrappingD1Database();
  const env: Env = { DB: db };
  const request = new Request("https://example.com/api/artists", { method: "GET" });

  const response = await worker.fetch(request, env);
  assert.equal(response.status, 200);
  const payload = (await response.json()) as unknown[];
  assert.deepEqual(payload, []);

  assert.equal(db.artistTagsTableCreated, true);
  assert.equal(db.artistTagsIndexCreated, true);
});
