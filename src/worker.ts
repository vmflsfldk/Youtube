export interface Env {
  DB: D1Database;
  GOOGLE_OAUTH_CLIENT_IDS?: string;
  GOOGLE_CLIENT_ID?: string;
  YOUTUBE_API_KEY?: string;
}

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run<T = unknown>(): Promise<D1Result<T>>;
};

type D1Result<T> = {
  results?: T[];
  success: boolean;
  error?: string;
  meta: {
    duration: number;
    changes: number;
    last_row_id?: number;
  };
};

interface ArtistResponse {
  id: number;
  name: string;
  displayName: string;
  youtubeChannelId: string;
  youtubeChannelTitle?: string | null;
  profileImageUrl?: string | null;
  availableKo: boolean;
  availableEn: boolean;
  availableJp: boolean;
  agency?: string | null;
  tags: string[];
}

interface VideoArtistResponse {
  id: number;
  name: string;
  displayName: string;
  youtubeChannelId: string;
  youtubeChannelTitle?: string | null;
  profileImageUrl?: string | null;
  isPrimary: boolean;
}

const VIDEO_CONTENT_TYPES = ["OFFICIAL", "CLIP_SOURCE"] as const;
type VideoContentType = (typeof VIDEO_CONTENT_TYPES)[number];

const VIDEO_CATEGORIES = ["live", "cover", "original"] as const;
type VideoCategory = (typeof VIDEO_CATEGORIES)[number];

const ARTIST_TAG_DELIMITER = "\u001F";

const PLAYLIST_VISIBILITIES = ["PRIVATE", "UNLISTED", "PUBLIC"] as const;
type PlaylistVisibility = (typeof PLAYLIST_VISIBILITIES)[number];

const DEFAULT_PLAYLIST_VISIBILITY: PlaylistVisibility = "PRIVATE";

const isPlaylistVisibility = (value: unknown): value is PlaylistVisibility => {
  if (typeof value !== "string") {
    return false;
  }
  return (PLAYLIST_VISIBILITIES as readonly string[]).includes(value.toUpperCase());
};

const normalizePlaylistVisibility = (
  value: unknown,
  fallback: PlaylistVisibility = DEFAULT_PLAYLIST_VISIBILITY
): PlaylistVisibility => {
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.trim().toUpperCase();
  return isPlaylistVisibility(normalized) ? (normalized as PlaylistVisibility) : fallback;
};

const isVideoContentType = (value: unknown): value is VideoContentType => {
  if (typeof value !== "string") {
    return false;
  }
  return (VIDEO_CONTENT_TYPES as readonly string[]).includes(value as VideoContentType);
};

const normalizeVideoContentType = (value: string | null | undefined): VideoContentType | null => {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  return isVideoContentType(normalized) ? (normalized as VideoContentType) : null;
};

const isVideoCategory = (value: unknown): value is VideoCategory => {
  if (typeof value !== "string") {
    return false;
  }
  return (VIDEO_CATEGORIES as readonly string[]).includes(value.toLowerCase());
};

const normalizeVideoCategory = (value: string | null | undefined): VideoCategory | null => {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return isVideoCategory(normalized) ? (normalized as VideoCategory) : null;
};

const deriveVideoCategoryFromTitle = (
  title: string | null | undefined
): VideoCategory | null => {
  if (!title) {
    return null;
  }

  const normalized = title.toLowerCase();

  if (normalized.includes("歌枠") || normalized.includes("live")) {
    return "live";
  }
  if (normalized.includes("cover")) {
    return "cover";
  }
  if (normalized.includes("original")) {
    return "original";
  }

  return null;
};

type VideoSectionSource = "YOUTUBE_CHAPTER" | "COMMENT" | "VIDEO_DESCRIPTION";

interface VideoSectionResponse {
  title: string;
  startSec: number;
  endSec: number;
  source: VideoSectionSource;
}

interface VideoResponse {
  id: number;
  artistId: number;
  primaryArtistId: number | null;
  youtubeVideoId: string;
  title: string;
  durationSec?: number | null;
  thumbnailUrl?: string | null;
  channelId?: string | null;
  contentType: VideoContentType;
  category: VideoCategory | null;
  hidden?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
  originalComposer?: string | null;
  artistName?: string;
  artistDisplayName?: string;
  artistYoutubeChannelId?: string;
  artistYoutubeChannelTitle?: string | null;
  artistProfileImageUrl?: string | null;
  artists: VideoArtistResponse[];
}

interface ClipResponse {
  id: number;
  videoId: number;
  title: string;
  startSec: number;
  endSec: number;
  tags: string[];
  originalComposer?: string | null;
  youtubeVideoId?: string;
  videoTitle?: string | null;
  videoOriginalComposer?: string | null;
  artistId?: number;
  primaryArtistId?: number | null;
  artistName?: string;
  artistDisplayName?: string;
  artistYoutubeChannelId?: string;
  artistYoutubeChannelTitle?: string | null;
  artistProfileImageUrl?: string | null;
  artists?: VideoArtistResponse[];
  createdAt?: string | null;
  updatedAt?: string | null;
}

interface ClipCandidateResponse {
  startSec: number;
  endSec: number;
  score: number;
  label: string;
}

interface PlaylistRow {
  id: number;
  owner_id: number;
  title: string;
  visibility: string;
  created_at: string;
  updated_at: string;
}

interface PlaylistItemRow {
  id: number;
  playlist_id: number;
  video_id: number | null;
  clip_id: number | null;
  ordering: number;
  created_at: string;
  updated_at: string;
}

type PlaylistItemType = "video" | "clip";

interface PlaylistItemResponse {
  id: number;
  playlistId: number;
  ordering: number;
  createdAt: string;
  updatedAt: string;
  type: PlaylistItemType;
  video?: VideoResponse;
  clip?: ClipResponse;
}

interface PlaylistResponse {
  id: number;
  ownerId: number;
  title: string;
  visibility: PlaylistVisibility;
  createdAt: string;
  updatedAt: string;
  items: PlaylistItemResponse[];
}

interface ChannelMetadataDebug {
  input: string;
  identifier: ReturnType<typeof parseYouTubeChannelIdentifier>;
  htmlCandidates: string[];
  attemptedHtml: boolean;
  attemptedApi: boolean;
  apiStatus: number | null;
  usedHtmlFallback: boolean;
  usedApi: boolean;
  htmlChannelId: string | null;
  htmlTitle: string | null;
  htmlThumbnail: string | null;
  resolvedChannelId: string | null;
  warnings: string[];
  videoFetchAttempted: boolean;
  videoFetchStatus: number | null;
  videoFilterKeywords: string[];
  filteredVideoCount: number;
  videoFetchError: string | null;
}

interface ChannelMetadata {
  title: string | null;
  profileImageUrl: string | null;
  channelId: string | null;
  debug: ChannelMetadataDebug;
}

interface WorkerTestOverrides {
  fetchVideoMetadata(env: Env, videoId: string): Promise<{
    title: string;
    durationSec: number | null;
    thumbnailUrl: string | null;
    channelId: string | null;
    description: string | null;
  }>;
  fetchChannelMetadata(env: Env, channelId: string): Promise<ChannelMetadata>;
  detectFromChapterSources(
    env: Env,
    youtubeVideoId: string,
    durationSec: number | null
  ): Promise<ClipCandidateResponse[]>;
  detectFromDescription(video: { durationSec: number | null; description: string | null }): ClipCandidateResponse[];
  detectFromCaptions(video: { durationSec: number | null; captionsJson: string | null }): ClipCandidateResponse[];
}

const testOverrides: WorkerTestOverrides = {
  fetchVideoMetadata,
  fetchChannelMetadata,
  detectFromChapterSources,
  detectFromDescription,
  detectFromCaptions
};

interface CorsConfig {
  origin: string | null;
  requestHeaders: string | null;
  allowPrivateNetwork: boolean;
}

const ORIGIN_RULES: RegExp[] = [
  /^https:\/\/youtube-1my\.pages\.dev$/i,
  /^https:\/\/[a-z0-9-]+\.youtube-1my\.pages\.dev$/i,
  /^http:\/\/localhost:(5173|4173)$/i,
  /^http:\/\/127\.0\.0\.1:(5173|4173)$/i
];

const GOOGLE_TOKENINFO_ENDPOINT = "https://oauth2.googleapis.com/tokeninfo";

const DEFAULT_ALLOWED_GOOGLE_CLIENT_IDS = Object.freeze([
  "245943329145-os94mkp21415hadulir67v1i0lqjrcnq.apps.googleusercontent.com"
]);

const resolveAllowedGoogleAudiences = (env: Env): string[] => {
  const configured = [env.GOOGLE_OAUTH_CLIENT_IDS, env.GOOGLE_CLIENT_ID]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (configured.length > 0) {
    return Array.from(new Set(configured));
  }
  return DEFAULT_ALLOWED_GOOGLE_CLIENT_IDS;
};

interface GoogleTokenInfoPayload {
  aud?: string;
  email?: string;
  email_verified?: string | boolean;
  exp?: string;
  name?: string;
}

interface VerifiedGoogleIdentity {
  email: string;
  displayName?: string;
}

async function verifyGoogleIdToken(env: Env, token: string): Promise<VerifiedGoogleIdentity | null> {
  if (!token) {
    return null;
  }
  let response: Response;
  try {
    const url = `${GOOGLE_TOKENINFO_ENDPOINT}?id_token=${encodeURIComponent(token)}`;
    response = await fetch(url, { method: "GET" });
  } catch (error) {
    console.error("[yt-clip] Failed to contact Google token verification endpoint", error);
    return null;
  }
  if (!response.ok) {
    console.warn(`[yt-clip] Google token verification failed with status ${response.status}`);
    return null;
  }
  let payload: GoogleTokenInfoPayload;
  try {
    payload = (await response.json()) as GoogleTokenInfoPayload;
  } catch (error) {
    console.error("[yt-clip] Failed to parse Google token verification response", error);
    return null;
  }
  const email = typeof payload.email === "string" ? payload.email.trim() : "";
  if (!email) {
    console.warn("[yt-clip] Google token verification response did not include an email");
    return null;
  }
  const emailVerified = payload.email_verified;
  if (typeof emailVerified !== "undefined" && String(emailVerified).toLowerCase() !== "true") {
    console.warn(`[yt-clip] Google token email for ${email} is not verified`);
    return null;
  }
  const audiences = resolveAllowedGoogleAudiences(env);
  const audience = typeof payload.aud === "string" ? payload.aud.trim() : "";
  if (!audience || !audiences.includes(audience)) {
    console.warn(`[yt-clip] Google token audience ${audience || "<missing>"} is not allowed`);
    return null;
  }
  const expValue = payload.exp ? Number(payload.exp) : NaN;
  if (Number.isFinite(expValue) && expValue * 1000 <= Date.now()) {
    console.warn(`[yt-clip] Google token for ${email} is expired`);
    return null;
  }
  const displayName = typeof payload.name === "string" ? payload.name.trim() : "";
  return { email, displayName: displayName || undefined };
}

const normalizeOrigin = (origin: string): string | null => {
  const trimmed = origin.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const { protocol, host } = new URL(trimmed);
    return `${protocol}//${host}`.replace(/\/+$/, "").toLowerCase();
  } catch {
    return trimmed.replace(/\/+$/, "").toLowerCase() || null;
  }
};

const resolveAllowedOrigin = (origin: string | null): string => {
  if (!origin) return "*";
  const normalized = normalizeOrigin(origin);
  if (!normalized) {
    return "*";
  }
  return ORIGIN_RULES.some((re) => re.test(normalized)) ? origin : "*";
};

interface UserContext {
  id: number;
  email: string;
  displayName: string | null;
}

interface ArtistRow {
  id: number;
  name: string;
  display_name: string | null;
  youtube_channel_id: string;
  youtube_channel_title: string | null;
  profile_image_url: string | null;
  available_ko: number | null;
  available_en: number | null;
  available_jp: number | null;
  agency: string | null;
  tags: string[];
}

interface ArtistQueryRow {
  id: number;
  name: string;
  display_name: string | null;
  youtube_channel_id: string;
  youtube_channel_title: string | null;
  profile_image_url: string | null;
  available_ko: number | null;
  available_en: number | null;
  available_jp: number | null;
  agency: string | null;
  tags: string | null;
}

interface TableInfoRow {
  name: string | null;
  notnull?: number | null;
}

let hasEnsuredSchema = false;
let hasEnsuredArtistDisplayNameColumn = false;
let hasEnsuredArtistProfileImageColumn = false;
let hasEnsuredArtistUpdatedAtColumn = false;
let hasEnsuredArtistChannelTitleColumn = false;
let hasEnsuredArtistCountryColumns = false;
let hasEnsuredArtistAgencyColumn = false;
let hasEnsuredVideoContentTypeColumn = false;
let hasEnsuredVideoHiddenColumn = false;
let hasEnsuredVideoCategoryColumn = false;
let hasEnsuredVideoOriginalComposerColumn = false;
let hasEnsuredClipOriginalComposerColumn = false;
let hasEnsuredVideoArtistsTable = false;
let hasWarnedMissingYouTubeApiKey = false;

const warnMissingYouTubeApiKey = (): void => {
  if (hasWarnedMissingYouTubeApiKey) {
    return;
  }
  console.warn("[yt-clip] YOUTUBE_API_KEY is not configured; YouTube metadata fetches will be skipped.");
  hasWarnedMissingYouTubeApiKey = true;
};

const sanitizeArtistTags = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const sanitized: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") {
      continue;
    }
    const trimmed = entry.trim();
    if (!trimmed) {
      continue;
    }
    const normalized = trimmed.slice(0, 255);
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    sanitized.push(normalized);
  }
  sanitized.sort((a, b) => a.localeCompare(b));
  return sanitized;
};

const parseArtistTagList = (value: string | null | undefined): string[] => {
  if (!value) {
    return [];
  }
  const segments = value.split(ARTIST_TAG_DELIMITER);
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const segment of segments) {
    const trimmed = segment.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    tags.push(trimmed);
  }
  tags.sort((a, b) => a.localeCompare(b));
  return tags;
};

const toBooleanFlag = (value: number | string | null | undefined): boolean => {
  if (typeof value === "number") {
    return value === 1;
  }
  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) {
      return false;
    }
    const numeric = Number.parseInt(normalized, 10);
    if (Number.isFinite(numeric)) {
      return numeric === 1;
    }
    return normalized.toLowerCase() === "true";
  }
  return false;
};

const normalizeAvailabilityInput = (value: unknown): number => {
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  if (typeof value === "number") {
    return value === 1 ? 1 : 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return 0;
    }
    if (normalized === "1" || normalized === "true") {
      return 1;
    }
  }
  return 0;
};

const normalizeArtistRow = (row: ArtistQueryRow): ArtistRow => {
  return {
    id: row.id,
    name: row.name,
    display_name: row.display_name,
    youtube_channel_id: row.youtube_channel_id,
    youtube_channel_title: row.youtube_channel_title,
    profile_image_url: row.profile_image_url,
    available_ko: Number(row.available_ko ?? 0),
    available_en: Number(row.available_en ?? 0),
    available_jp: Number(row.available_jp ?? 0),
    agency: row.agency,
    tags: parseArtistTagList(row.tags)
  };
};

const isStatementError = (result: D1Result<unknown>, context: string): boolean => {
  if (result.success) {
    return false;
  }
  console.error(`[yt-clip] Failed to execute schema statement (${context}):`, result.error);
  return true;
};

async function ensureDatabaseSchema(db: D1Database): Promise<void> {
  if (hasEnsuredSchema) {
    return;
  }

  const statements: Array<{ sql: string; context: string }> = [
    { sql: "PRAGMA foreign_keys = ON", context: "foreign_keys" },
    {
      sql: `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        display_name TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      )`,
      context: "users"
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS artists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        youtube_channel_id TEXT NOT NULL,
        created_by INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        display_name TEXT,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
      )`,
      context: "artists"
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS user_favorite_artists (
        user_id INTEGER NOT NULL,
        artist_id INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        UNIQUE (user_id, artist_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
      )`,
      context: "user_favorite_artists"
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS videos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        artist_id INTEGER NOT NULL,
        youtube_video_id TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        duration_sec INTEGER,
        thumbnail_url TEXT,
        channel_id TEXT,
        description TEXT,
        captions_json TEXT,
        original_composer TEXT,
        content_type TEXT NOT NULL DEFAULT ('OFFICIAL'),
        hidden INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
      )`,
      context: "videos"
    },
    {
      sql: `CREATE TRIGGER IF NOT EXISTS trg_videos_updated_at
        AFTER UPDATE ON videos
        FOR EACH ROW
        BEGIN
            UPDATE videos SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
        END`,
      context: "trg_videos_updated_at"
    },
    {
      sql: `CREATE TRIGGER IF NOT EXISTS trg_artists_updated_at
        AFTER UPDATE ON artists
        FOR EACH ROW
        BEGIN
          UPDATE artists SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
        END`,
      context: "trg_artists_updated_at"
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS clips (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        video_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        start_sec INTEGER NOT NULL,
        end_sec INTEGER NOT NULL,
        original_composer TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
      )`,
      context: "clips"
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS clip_tags (
        clip_id INTEGER NOT NULL,
        tag TEXT NOT NULL,
        FOREIGN KEY (clip_id) REFERENCES clips(id) ON DELETE CASCADE
      )`,
      context: "clip_tags"
    },
    {
      sql: "CREATE INDEX IF NOT EXISTS idx_artists_created_by ON artists(created_by)",
      context: "idx_artists_created_by"
    },
    {
      sql: "CREATE INDEX IF NOT EXISTS idx_videos_artist ON videos(artist_id)",
      context: "idx_videos_artist"
    },
    {
      sql: "CREATE INDEX IF NOT EXISTS idx_clips_video ON clips(video_id)",
      context: "idx_clips_video"
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS artist_tags (
        artist_id INTEGER NOT NULL,
        tag TEXT NOT NULL,
        PRIMARY KEY (artist_id, tag),
        FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
      )`,
      context: "artist_tags"
    },
    {
      sql: "CREATE INDEX IF NOT EXISTS idx_artist_tags_tag ON artist_tags(tag)",
      context: "idx_artist_tags_tag"
    },
    {
      sql: "CREATE INDEX IF NOT EXISTS idx_clip_tags_clip ON clip_tags(clip_id)",
      context: "idx_clip_tags_clip"
    },
    {
      sql: "CREATE INDEX IF NOT EXISTS idx_favorites_user ON user_favorite_artists(user_id)",
      context: "idx_favorites_user"
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS playlists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        visibility TEXT NOT NULL DEFAULT ('PRIVATE'),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
        CHECK (visibility IN ('PRIVATE', 'UNLISTED', 'PUBLIC'))
      )`,
      context: "playlists"
    },
    {
      sql: `CREATE TRIGGER IF NOT EXISTS trg_playlists_updated_at
        AFTER UPDATE ON playlists
        FOR EACH ROW
        BEGIN
          UPDATE playlists SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
        END`,
      context: "trg_playlists_updated_at"
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS playlist_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        playlist_id INTEGER NOT NULL,
        video_id INTEGER,
        clip_id INTEGER,
        ordering INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
        FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
        FOREIGN KEY (clip_id) REFERENCES clips(id) ON DELETE CASCADE,
        CHECK ((video_id IS NOT NULL AND clip_id IS NULL) OR (video_id IS NULL AND clip_id IS NOT NULL))
      )`,
      context: "playlist_items"
    },
    {
      sql: `CREATE UNIQUE INDEX IF NOT EXISTS idx_playlist_items_playlist_order ON playlist_items(playlist_id, ordering)`,
      context: "idx_playlist_items_playlist_order"
    },
    {
      sql: "CREATE INDEX IF NOT EXISTS idx_playlist_items_video ON playlist_items(video_id)",
      context: "idx_playlist_items_video"
    },
    {
      sql: "CREATE INDEX IF NOT EXISTS idx_playlist_items_clip ON playlist_items(clip_id)",
      context: "idx_playlist_items_clip"
    },
    {
      sql: `CREATE TRIGGER IF NOT EXISTS trg_playlist_items_updated_at
        AFTER UPDATE ON playlist_items
        FOR EACH ROW
        BEGIN
          UPDATE playlist_items SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
        END`,
      context: "trg_playlist_items_updated_at"
    }
  ];

  for (const { sql, context } of statements) {
    const result = await db.prepare(sql).run();
    if (isStatementError(result, context)) {
      throw new Error(result.error ?? `Failed to initialize database: ${context}`);
    }
  }

  hasEnsuredSchema = true;
}

const isDuplicateColumnError = (error: string | undefined): boolean =>
  typeof error === "string" && /duplicate column name/i.test(error);

async function ensureArtistDisplayNameColumn(db: D1Database): Promise<void> {
  if (hasEnsuredArtistDisplayNameColumn) {
    return;
  }

  const { results } = await db.prepare("PRAGMA table_info(artists)").all<TableInfoRow>();
  const hasColumn = (results ?? []).some((column) => column.name?.toLowerCase() === "display_name");

  if (!hasColumn) {
    const alterResult = await db.prepare("ALTER TABLE artists ADD COLUMN display_name TEXT").run();
    if (!alterResult.success && !isDuplicateColumnError(alterResult.error)) {
      throw new Error(alterResult.error ?? "Failed to add display_name column to artists table");
    }
  }

  const updateResult = await db
    .prepare(
      "UPDATE artists SET display_name = name WHERE display_name IS NULL OR display_name = ''"
    )
    .run();
  if (!updateResult.success) {
    throw new Error(updateResult.error ?? "Failed to backfill artist display names");
  }

  hasEnsuredArtistDisplayNameColumn = true;
}

async function ensureArtistProfileImageColumn(db: D1Database): Promise<void> {
  if (hasEnsuredArtistProfileImageColumn) {
    return;
  }

  const { results } = await db.prepare("PRAGMA table_info(artists)").all<TableInfoRow>();
  const hasColumn = (results ?? []).some((column) => column.name?.toLowerCase() === "profile_image_url");

  if (!hasColumn) {
    const alterResult = await db.prepare("ALTER TABLE artists ADD COLUMN profile_image_url TEXT").run();
    if (!alterResult.success && !isDuplicateColumnError(alterResult.error)) {
      throw new Error(alterResult.error ?? "Failed to add profile_image_url column to artists table");
    }
  }

  hasEnsuredArtistProfileImageColumn = true;
}

async function ensureArtistChannelTitleColumn(db: D1Database): Promise<void> {
  if (hasEnsuredArtistChannelTitleColumn) {
    return;
  }

  const { results } = await db.prepare("PRAGMA table_info(artists)").all<TableInfoRow>();
  const hasColumn = (results ?? []).some((column) => column.name?.toLowerCase() === "youtube_channel_title");

  if (!hasColumn) {
    const alterResult = await db.prepare("ALTER TABLE artists ADD COLUMN youtube_channel_title TEXT").run();
    if (!alterResult.success && !isDuplicateColumnError(alterResult.error)) {
      throw new Error(alterResult.error ?? "Failed to add youtube_channel_title column to artists table");
    }
  }

  hasEnsuredArtistChannelTitleColumn = true;
}

async function ensureArtistCountryColumns(db: D1Database): Promise<void> {
  if (hasEnsuredArtistCountryColumns) {
    return;
  }

  const { results } = await db.prepare("PRAGMA table_info(artists)").all<TableInfoRow>();
  const columns = new Set((results ?? []).map((column) => column.name?.toLowerCase() ?? ""));

  const operations: Array<{ name: string; sql: string }> = [
    { name: "available_ko", sql: "ALTER TABLE artists ADD COLUMN available_ko INTEGER NOT NULL DEFAULT 0" },
    { name: "available_en", sql: "ALTER TABLE artists ADD COLUMN available_en INTEGER NOT NULL DEFAULT 0" },
    { name: "available_jp", sql: "ALTER TABLE artists ADD COLUMN available_jp INTEGER NOT NULL DEFAULT 0" }
  ];

  for (const operation of operations) {
    if (columns.has(operation.name)) {
      continue;
    }
    const alterResult = await db.prepare(operation.sql).run();
    if (!alterResult.success && !isDuplicateColumnError(alterResult.error)) {
      throw new Error(alterResult.error ?? `Failed to add ${operation.name} column to artists table`);
    }
  }

  hasEnsuredArtistCountryColumns = true;
}

async function ensureArtistAgencyColumn(db: D1Database): Promise<void> {
  if (hasEnsuredArtistAgencyColumn) {
    return;
  }

  const { results } = await db.prepare("PRAGMA table_info(artists)").all<TableInfoRow>();
  const hasColumn = (results ?? []).some((column) => column.name?.toLowerCase() === "agency");

  if (!hasColumn) {
    const alterResult = await db.prepare("ALTER TABLE artists ADD COLUMN agency TEXT").run();
    if (!alterResult.success && !isDuplicateColumnError(alterResult.error)) {
      throw new Error(alterResult.error ?? "Failed to add agency column to artists table");
    }
  }

  hasEnsuredArtistAgencyColumn = true;
}

async function ensureArtistUpdatedAtColumn(db: D1Database): Promise<void> {
  if (hasEnsuredArtistUpdatedAtColumn) {
    return;
  }

  const { results } = await db.prepare("PRAGMA table_info(artists)").all<TableInfoRow>();
  const hasColumn = (results ?? []).some((column) => column.name?.toLowerCase() === "updated_at");

  if (!hasColumn) {
    const alterResult = await db.prepare("ALTER TABLE artists ADD COLUMN updated_at TEXT").run();
    if (!alterResult.success && !isDuplicateColumnError(alterResult.error)) {
      throw new Error(alterResult.error ?? "Failed to add updated_at column to artists table");
    }
  }

  const backfillResult = await db
    .prepare(
      "UPDATE artists SET updated_at = COALESCE(updated_at, created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))"
    )
    .run();
  if (!backfillResult.success) {
    throw new Error(backfillResult.error ?? "Failed to backfill artist updated_at values");
  }

  const triggerResult = await db
    .prepare(
      `CREATE TRIGGER IF NOT EXISTS trg_artists_updated_at
        AFTER UPDATE ON artists
        FOR EACH ROW
        BEGIN
          UPDATE artists SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
        END`
    )
    .run();
  if (!triggerResult.success) {
    throw new Error(triggerResult.error ?? "Failed to ensure trg_artists_updated_at trigger");
  }

  hasEnsuredArtistUpdatedAtColumn = true;
}

async function ensureVideoContentTypeColumn(db: D1Database): Promise<void> {
  if (hasEnsuredVideoContentTypeColumn) {
    return;
  }

  const { results } = await db.prepare("PRAGMA table_info(videos)").all<TableInfoRow>();
  const hasColumn = (results ?? []).some((column) => column.name?.toLowerCase() === "content_type");

  if (!hasColumn) {
    const alterResult = await db
      .prepare("ALTER TABLE videos ADD COLUMN content_type TEXT NOT NULL DEFAULT 'OFFICIAL'")
      .run();
    if (!alterResult.success && !isDuplicateColumnError(alterResult.error)) {
      throw new Error(alterResult.error ?? "Failed to add content_type column to videos table");
    }
  }

  const backfillResult = await db
    .prepare(
      "UPDATE videos SET content_type = COALESCE(NULLIF(content_type, ''), 'OFFICIAL')"
    )
    .run();
  if (!backfillResult.success) {
    throw new Error(backfillResult.error ?? "Failed to backfill video content_type values");
  }

  hasEnsuredVideoContentTypeColumn = true;
}

async function ensureVideoHiddenColumn(db: D1Database): Promise<void> {
  if (hasEnsuredVideoHiddenColumn) {
    return;
  }

  const { results } = await db.prepare("PRAGMA table_info(videos)").all<TableInfoRow>();
  const hasColumn = (results ?? []).some((column) => column.name?.toLowerCase() === "hidden");

  if (!hasColumn) {
    const alterResult = await db
      .prepare("ALTER TABLE videos ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0")
      .run();
    if (!alterResult.success && !isDuplicateColumnError(alterResult.error)) {
      throw new Error(alterResult.error ?? "Failed to add hidden column to videos table");
    }
  }

  const backfillResult = await db.prepare("UPDATE videos SET hidden = COALESCE(hidden, 0)").run();
  if (!backfillResult.success) {
    throw new Error(backfillResult.error ?? "Failed to backfill video hidden values");
  }

  hasEnsuredVideoHiddenColumn = true;
}

async function ensureVideoCategoryColumn(db: D1Database): Promise<void> {
  if (hasEnsuredVideoCategoryColumn) {
    return;
  }

  const { results } = await db.prepare("PRAGMA table_info(videos)").all<TableInfoRow>();
  const hasColumn = (results ?? []).some((column) => column.name?.toLowerCase() === "category");

  if (!hasColumn) {
    const alterResult = await db.prepare("ALTER TABLE videos ADD COLUMN category TEXT").run();
    if (!alterResult.success && !isDuplicateColumnError(alterResult.error)) {
      throw new Error(alterResult.error ?? "Failed to add category column to videos table");
    }
  }

  hasEnsuredVideoCategoryColumn = true;
}

async function ensureVideoOriginalComposerColumn(db: D1Database): Promise<void> {
  if (hasEnsuredVideoOriginalComposerColumn) {
    return;
  }

  const { results } = await db.prepare("PRAGMA table_info(videos)").all<TableInfoRow>();
  const hasColumn = (results ?? []).some((column) => column.name?.toLowerCase() === "original_composer");

  if (!hasColumn) {
    const alterResult = await db.prepare("ALTER TABLE videos ADD COLUMN original_composer TEXT").run();
    if (!alterResult.success && !isDuplicateColumnError(alterResult.error)) {
      throw new Error(alterResult.error ?? "Failed to add original_composer column to videos table");
    }
  }

  hasEnsuredVideoOriginalComposerColumn = true;
}

async function ensureVideoArtistsTable(db: D1Database): Promise<void> {
  if (hasEnsuredVideoArtistsTable) {
    return;
  }

  const createResult = await db
    .prepare(`
      CREATE TABLE IF NOT EXISTS video_artists (
        video_id INTEGER NOT NULL,
        artist_id INTEGER NOT NULL,
        is_primary INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        PRIMARY KEY (video_id, artist_id),
        FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
        FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
      )
    `)
    .run();
  if (!createResult.success) {
    throw new Error(createResult.error ?? "Failed to ensure video_artists table");
  }

  const indexResult = await db
    .prepare("CREATE INDEX IF NOT EXISTS idx_video_artists_artist ON video_artists(artist_id, video_id)")
    .run();
  if (!indexResult.success) {
    throw new Error(indexResult.error ?? "Failed to ensure video_artists index");
  }

  hasEnsuredVideoArtistsTable = true;
}

async function upsertVideoArtistLink(
  env: Env,
  videoId: number,
  artistId: number,
  isPrimary: boolean
): Promise<void> {
  await ensureVideoArtistsTable(env.DB);
  const result = await env.DB
    .prepare(
      `INSERT INTO video_artists (video_id, artist_id, is_primary)
         VALUES (?, ?, ?)
         ON CONFLICT(video_id, artist_id) DO UPDATE SET is_primary = excluded.is_primary`
    )
    .bind(videoId, artistId, isPrimary ? 1 : 0)
    .run();
  if (!result.success) {
    throw new Error(result.error ?? "Failed to upsert video artist link");
  }
}

async function setVideoPrimaryArtist(env: Env, videoId: number, artistId: number): Promise<void> {
  await ensureVideoArtistsTable(env.DB);
  const result = await env.DB
    .prepare(
      `UPDATE video_artists
          SET is_primary = CASE WHEN artist_id = ? THEN 1 ELSE 0 END
        WHERE video_id = ?`
    )
    .bind(artistId, videoId)
    .run();
  if (!result.success) {
    throw new Error(result.error ?? "Failed to update primary video artist");
  }
}

async function fetchVideoArtistMap(
  env: Env,
  videoIds: number[]
): Promise<Map<number, VideoArtistResponse[]>> {
  await ensureVideoArtistsTable(env.DB);
  if (videoIds.length === 0) {
    return new Map();
  }

  const placeholders = videoIds.map(() => "?").join(", ");
  const { results } = await env.DB
    .prepare(
      `SELECT
          va.video_id,
          va.artist_id,
          va.is_primary,
          a.name,
          a.display_name,
          a.youtube_channel_id,
          a.youtube_channel_title,
          a.profile_image_url
        FROM video_artists va
        JOIN artists a ON a.id = va.artist_id
       WHERE va.video_id IN (${placeholders})
       ORDER BY va.video_id, va.is_primary DESC, a.id`
    )
    .bind(...videoIds)
    .all<VideoArtistJoinRow>();

  const map = new Map<number, VideoArtistResponse[]>();
  for (const row of results ?? []) {
    const displayName = row.display_name?.trim() || row.name;
    const entry: VideoArtistResponse = {
      id: row.artist_id,
      name: row.name,
      displayName,
      youtubeChannelId: row.youtube_channel_id,
      youtubeChannelTitle: row.youtube_channel_title ?? null,
      profileImageUrl: row.profile_image_url ?? null,
      isPrimary: Number(row.is_primary ?? 0) === 1
    };
    const bucket = map.get(row.video_id);
    if (bucket) {
      bucket.push(entry);
    } else {
      map.set(row.video_id, [entry]);
    }
  }

  for (const [videoId, artists] of map.entries()) {
    artists.sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) {
        return a.isPrimary ? -1 : 1;
      }
      return a.id - b.id;
    });
    map.set(videoId, artists);
  }

  return map;
}

async function loadVideoResponseMap(env: Env, videoIds: number[]): Promise<Map<number, VideoResponse>> {
  if (videoIds.length === 0) {
    return new Map();
  }

  const placeholders = videoIds.map(() => "?").join(", ");
  const { results } = await env.DB
    .prepare(
      `SELECT
          v.id,
          v.artist_id,
          v.youtube_video_id,
          v.title,
          v.duration_sec,
          v.thumbnail_url,
          v.channel_id,
          v.description,
          v.captions_json,
          v.category,
          v.content_type,
          v.hidden,
          v.original_composer,
          v.created_at,
          v.updated_at,
          a.name AS artist_name,
          a.display_name AS artist_display_name,
          a.youtube_channel_id AS artist_youtube_channel_id,
          a.youtube_channel_title AS artist_youtube_channel_title,
          a.profile_image_url AS artist_profile_image_url
        FROM videos v
        LEFT JOIN artists a ON a.id = v.artist_id
       WHERE v.id IN (${placeholders})`
    )
    .bind(...videoIds)
    .all<VideoLibraryRow>();

  const artistMap = await fetchVideoArtistMap(env, videoIds);
  const map = new Map<number, VideoResponse>();
  for (const row of results ?? []) {
    map.set(row.id, toVideoLibraryResponse(row, { artists: artistMap.get(row.id) ?? [] }));
  }
  return map;
}

async function ensureClipOriginalComposerColumn(db: D1Database): Promise<void> {
  if (hasEnsuredClipOriginalComposerColumn) {
    return;
  }

  const { results } = await db.prepare("PRAGMA table_info(clips)").all<TableInfoRow>();
  const hasColumn = (results ?? []).some((column) => column.name?.toLowerCase() === "original_composer");

  if (!hasColumn) {
    const alterResult = await db.prepare("ALTER TABLE clips ADD COLUMN original_composer TEXT").run();
    if (!alterResult.success && !isDuplicateColumnError(alterResult.error)) {
      throw new Error(alterResult.error ?? "Failed to add original_composer column to clips table");
    }
  }

  hasEnsuredClipOriginalComposerColumn = true;
}

interface VideoRow {
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
  created_at: string;
  updated_at: string;
}

interface VideoLibraryRow extends VideoRow {
  artist_name: string;
  artist_display_name: string | null;
  artist_youtube_channel_id: string;
  artist_youtube_channel_title: string | null;
  artist_profile_image_url: string | null;
  requested_artist_id?: number | null;
}

interface VideoArtistJoinRow {
  video_id: number;
  artist_id: number;
  is_primary: number | null;
  name: string;
  display_name: string | null;
  youtube_channel_id: string;
  youtube_channel_title: string | null;
  profile_image_url: string | null;
}

interface ClipRow {
  id: number;
  video_id: number;
  title: string;
  start_sec: number;
  end_sec: number;
  original_composer: string | null;
  created_at: string;
  updated_at?: string | null;
}

const DEFAULT_CLIP_LENGTH = 30;
const DEFAULT_SECTION_LENGTH = 45;
const KEYWORDS = ["chorus", "hook", "verse", "intro", "outro"];
const TIMESTAMP_PATTERN =
  /^(?:(?:\d+\s*[\.)-]\s*)|(?:\d+\s+)|(?:[-•*]\s*))?(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\s*-?\s*(.*)$/i;

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const collectAllowedHeaders = (requestedHeaders: string | null): string => {
  const headers = new Map<string, string>();
  for (const header of ["Content-Type", "Authorization", "X-User-Email", "X-User-Name"]) {
    headers.set(header.toLowerCase(), header);
  }
  if (requestedHeaders) {
    for (const rawHeader of requestedHeaders.split(",")) {
      const header = rawHeader.trim();
      if (!header) {
        continue;
      }
      headers.set(header.toLowerCase(), header);
    }
  }
  return Array.from(headers.values()).join(", ");
};

const corsHeaders = (config: CorsConfig): Headers => {
  const headers = new Headers();
  const allowedOrigin = resolveAllowedOrigin(config.origin);
  headers.set("Access-Control-Allow-Origin", allowedOrigin);
  if (allowedOrigin !== "*") {
    headers.set("Vary", "Origin");
  }
  headers.append("Vary", "Access-Control-Request-Headers");
  headers.append("Vary", "Access-Control-Request-Method");
  headers.set("Access-Control-Allow-Headers", collectAllowedHeaders(config.requestHeaders));
  headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  if (allowedOrigin !== "*") {
    headers.set("Access-Control-Allow-Credentials", "true");
  }
  headers.set("Access-Control-Max-Age", "86400");
  if (config.allowPrivateNetwork) {
    headers.set("Access-Control-Allow-Private-Network", "true");
  }
  return headers;
};

const mergeHeaderList = (existing: string | null, value: string): string => {
  if (!existing) {
    return value;
  }
  const parts = (raw: string) =>
    raw
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  const merged = new Set<string>(parts(existing));
  for (const item of parts(value)) {
    merged.add(item);
  }
  return Array.from(merged).join(", ");
};

const withCors = (response: Response, cors: CorsConfig): Response => {
  const headers = new Headers(response.headers);
  const corsMap = corsHeaders(cors);
  for (const [key, value] of corsMap.entries()) {
    if (key.toLowerCase() === "vary") {
      headers.set("Vary", mergeHeaderList(headers.get("Vary"), value));
    } else {
      headers.set(key, value);
    }
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
};

const jsonResponse = (data: unknown, status: number, cors: CorsConfig): Response => {
  const headers = corsHeaders(cors);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(data), { status, headers });
};

const emptyResponse = (status: number, cors: CorsConfig): Response => {
  return new Response(null, { status, headers: corsHeaders(cors) });
};

const normalizePath = (pathname: string): string => {
  if (pathname === "/") {
    return pathname;
  }
  return pathname.replace(/\/+$/, "") || "/";
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);
    const cors: CorsConfig = {
      origin: request.headers.get("Origin"),
      requestHeaders: request.headers.get("Access-Control-Request-Headers"),
      allowPrivateNetwork: request.headers.get("Access-Control-Request-Private-Network") === "true"
    };

    if (request.method === "OPTIONS") {
      return emptyResponse(204, cors);
    }

    if (path.startsWith("/api/")) {
      return await handleApi(request, env, cors, url, path);
    }

    return withCors(new Response("ok"), cors);
  }
};

async function handleApi(
  request: Request,
  env: Env,
  cors: CorsConfig,
  url: URL,
  path: string
): Promise<Response> {
  try {
    await ensureDatabaseSchema(env.DB);

    if (request.method === "POST" && path === "/api/users/login") {
      return await loginUser(request, env, cors);
    }

    if (request.method === "GET" && path === "/api/public/clips") {
      return await listPublicPlaylists(env, cors);
    }

    const user = await getUserFromHeaders(env, request.headers);

    if (request.method === "POST" && path === "/api/artists/preview") {
      return await previewArtist(request, env, requireUser(user), cors);
    }
    if (request.method === "POST" && path === "/api/artists") {
      return await createArtist(request, env, requireUser(user), cors);
    }
    if (request.method === "GET" && path === "/api/artists") {
      return await listArtists(url, env, user, cors);
    }
    const updateArtistProfileMatch = path.match(/^\/api\/artists\/(\d+)\/profile$/);
    if (request.method === "PUT" && updateArtistProfileMatch) {
      const artistId = Number(updateArtistProfileMatch[1]);
      return await updateArtistProfile(request, env, requireUser(user), cors, artistId);
    }
    if (request.method === "POST" && path === "/api/users/me/nickname") {
      return await updateNickname(request, env, requireUser(user), cors);
    }
    if (request.method === "POST" && path === "/api/users/me/favorites") {
      return await toggleFavorite(request, env, requireUser(user), cors);
    }
    if (request.method === "POST" && path === "/api/playlists") {
      return await createPlaylist(request, env, requireUser(user), cors);
    }
    if (request.method === "GET" && path === "/api/playlists") {
      return await listPlaylists(env, requireUser(user), cors);
    }
    const createPlaylistItemMatch = path.match(/^\/api\/playlists\/(\d+)\/items$/);
    if (request.method === "POST" && createPlaylistItemMatch) {
      const playlistId = Number(createPlaylistItemMatch[1]);
      return await addPlaylistItem(request, env, requireUser(user), cors, playlistId);
    }
    const deletePlaylistItemMatch = path.match(/^\/api\/playlists\/(\d+)\/items\/(\d+)$/);
    if (request.method === "DELETE" && deletePlaylistItemMatch) {
      const playlistId = Number(deletePlaylistItemMatch[1]);
      const itemId = Number(deletePlaylistItemMatch[2]);
      return await deletePlaylistItem(env, requireUser(user), cors, playlistId, itemId);
    }
    if (request.method === "GET" && path === "/api/library/media") {
      return await listMediaLibrary(env, user, cors);
    }
    if (request.method === "GET" && path === "/api/public/library") {
      return await listPublicLibrary(env, cors);
    }
    if (path === "/api/videos") {
      if (request.method === "POST") {
        return await createVideo(request, env, requireUser(user), cors);
      }
      if (request.method === "GET") {
        return await listVideos(url, env, user, cors);
      }
    }
    const updateVideoMetadataMatch = path.match(/^\/api\/videos\/(\d+)$/);
    if (request.method === "PATCH" && updateVideoMetadataMatch) {
      const videoId = Number(updateVideoMetadataMatch[1]);
      return await updateVideoMetadata(request, env, requireUser(user), cors, videoId);
    }
    const updateVideoCategoryMatch = path.match(/^\/api\/videos\/(\d+)\/category$/);
    if (request.method === "PATCH" && updateVideoCategoryMatch) {
      const videoId = Number(updateVideoCategoryMatch[1]);
      return await updateVideoCategory(request, env, requireUser(user), cors, videoId);
    }
    if (request.method === "POST" && path === "/api/videos/clip-suggestions") {
      return await suggestClipCandidates(request, env, requireUser(user), cors);
    }
    if (path === "/api/clips") {
      if (request.method === "POST") {
        return await createClip(request, env, requireUser(user), cors);
      }
      if (request.method === "GET") {
        return await listClips(url, env, user, cors);
      }
    }
    const updateClipMatch = path.match(/^\/api\/clips\/(\d+)$/);
    if (request.method === "PUT" && updateClipMatch) {
      const clipId = Number(updateClipMatch[1]);
      return await updateClip(request, env, requireUser(user), cors, clipId);
    }
    if (request.method === "POST" && path === "/api/clips/auto-detect") {
      return await autoDetect(request, env, requireUser(user), cors);
    }

    return jsonResponse({ error: "Not Found" }, 404, cors);
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status, cors);
    }
    console.error("Unexpected error", error);
    return jsonResponse({ error: "Internal Server Error" }, 500, cors);
  }
}

async function previewArtist(
  request: Request,
  env: Env,
  _user: UserContext,
  cors: CorsConfig
): Promise<Response> {
  const body = await readJson(request);
  const youtubeChannelId = typeof body.youtubeChannelId === "string" ? body.youtubeChannelId.trim() : "";
  if (!youtubeChannelId) {
    throw new HttpError(400, "youtubeChannelId is required");
  }

  const metadata = await testOverrides.fetchChannelMetadata(env, youtubeChannelId);
  const resolvedChannelId = metadata.channelId?.trim() || null;
  const filteredVideos = await fetchFilteredChannelUploads(env, resolvedChannelId ?? youtubeChannelId, metadata.debug);

  const channelUrl = resolvedChannelId
    ? `https://www.youtube.com/channel/${resolvedChannelId}`
    : metadata.debug.identifier.handle
    ? `https://www.youtube.com/@${metadata.debug.identifier.handle}`
    : metadata.debug.identifier.username
    ? `https://www.youtube.com/${metadata.debug.identifier.username}`
    : null;

  return jsonResponse(
    {
      channelId: resolvedChannelId,
      profileImageUrl: metadata.profileImageUrl,
      title: metadata.title,
      channelUrl,
      debug: metadata.debug,
      videos: filteredVideos
    },
    200,
    cors
  );
}

async function createArtist(
  request: Request,
  env: Env,
  user: UserContext,
  cors: CorsConfig
): Promise<Response> {
  const body = await readJson(request);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const displayNameRaw = typeof body.displayName === "string" ? body.displayName : "";
  const youtubeChannelId = typeof body.youtubeChannelId === "string" ? body.youtubeChannelId.trim() : "";
  const agencyRaw = typeof body.agency === "string" ? body.agency : null;
  const normalizedAgencyValue = agencyRaw ? agencyRaw.trim() : "";
  const agency = normalizedAgencyValue.length > 0 ? normalizedAgencyValue : null;
  const availableKo = normalizeAvailabilityInput(body.availableKo);
  const availableEn = normalizeAvailabilityInput(body.availableEn);
  const availableJp = normalizeAvailabilityInput(body.availableJp);
  const tags = sanitizeArtistTags(body.tags);
  if (!name) {
    throw new HttpError(400, "name is required");
  }
  if (!youtubeChannelId) {
    throw new HttpError(400, "youtubeChannelId is required");
  }

  await ensureArtistUpdatedAtColumn(env.DB);
  await ensureArtistDisplayNameColumn(env.DB);
  await ensureArtistProfileImageColumn(env.DB);
  await ensureArtistChannelTitleColumn(env.DB);
  await ensureArtistCountryColumns(env.DB);
  await ensureArtistAgencyColumn(env.DB);

  const metadata = await testOverrides.fetchChannelMetadata(env, youtubeChannelId);
  const resolvedChannelId = metadata.channelId?.trim() || youtubeChannelId;
  const displayName = displayNameRaw.trim() || metadata.title || name;
  const profileImageUrl = metadata.profileImageUrl;
  const normalizedChannelTitle = metadata.title ? metadata.title.trim() : "";
  const channelTitle = normalizedChannelTitle.length > 0 ? normalizedChannelTitle : null;

  const existingArtist = await env.DB.prepare(
    "SELECT id FROM artists WHERE youtube_channel_id = ?"
  )
    .bind(resolvedChannelId)
    .first<{ id: number }>();

  if (existingArtist) {
    throw new HttpError(409, "이미 등록된 유튜브 채널입니다.");
  }

  const insertResult = await env.DB.prepare(
    "INSERT INTO artists (name, display_name, youtube_channel_id, youtube_channel_title, available_ko, available_en, available_jp, agency, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(
      name,
      displayName,
      resolvedChannelId,
      channelTitle,
      availableKo,
      availableEn,
      availableJp,
      agency,
      user.id
    )
    .run();
  if (!insertResult.success) {
    throw new HttpError(500, insertResult.error ?? "Failed to insert artist");
  }
  const artistId = numberFromRowId(insertResult.meta.last_row_id);

  let finalProfileImageUrl: string | null = null;
  if (profileImageUrl && profileImageUrl.trim().length > 0) {
    const updateResult = await env.DB
      .prepare("UPDATE artists SET profile_image_url = ? WHERE id = ?")
      .bind(profileImageUrl.trim(), artistId)
      .run();
    if (updateResult.success) {
      finalProfileImageUrl = profileImageUrl.trim();
    } else {
      console.warn(
        `[yt-clip] Failed to persist profile image URL for artist ${artistId}: ${updateResult.error ?? "unknown error"}`
      );
    }
  }

  if (tags.length > 0) {
    for (const tag of tags) {
      const tagResult = await env.DB
        .prepare("INSERT OR IGNORE INTO artist_tags (artist_id, tag) VALUES (?, ?)")
        .bind(artistId, tag)
        .run();
      if (!tagResult.success) {
        console.warn(
          `[yt-clip] Failed to persist artist tag ${tag} for artist ${artistId}: ${tagResult.error ?? "unknown error"}`
        );
      }
    }
  }

  return jsonResponse(
    {
      id: artistId,
      name,
      displayName,
      youtubeChannelId: resolvedChannelId,
      youtubeChannelTitle: channelTitle,
      profileImageUrl: finalProfileImageUrl,
      availableKo: availableKo === 1,
      availableEn: availableEn === 1,
      availableJp: availableJp === 1,
      agency,
      tags
    } satisfies ArtistResponse,
    201,
    cors
  );
}

async function updateNickname(
  request: Request,
  env: Env,
  user: UserContext,
  cors: CorsConfig
): Promise<Response> {
  const body = await readJson(request);
  const nicknameRaw = typeof body.nickname === "string" ? body.nickname.trim() : "";
  if (!nicknameRaw) {
    throw new HttpError(400, "nickname is required");
  }
  if (nicknameRaw.length < 2 || nicknameRaw.length > 20) {
    throw new HttpError(400, "닉네임은 2자 이상 20자 이하로 입력해주세요.");
  }

  const updateResult = await env.DB.prepare("UPDATE users SET display_name = ? WHERE id = ?")
    .bind(nicknameRaw, user.id)
    .run();

  if (!updateResult.success) {
    throw new HttpError(500, updateResult.error ?? "닉네임을 저장하지 못했습니다.");
  }

  user.displayName = nicknameRaw;
  return jsonResponse({ ...user }, 200, cors);
}

async function updateArtistProfile(
  request: Request,
  env: Env,
  user: UserContext,
  cors: CorsConfig,
  artistIdParam: number
): Promise<Response> {
  const artistId = Number(artistIdParam);
  if (!Number.isFinite(artistId)) {
    throw new HttpError(400, "artistId must be a number");
  }

  await ensureArtistUpdatedAtColumn(env.DB);
  await ensureArtistDisplayNameColumn(env.DB);
  await ensureArtistProfileImageColumn(env.DB);
  await ensureArtistChannelTitleColumn(env.DB);
  await ensureArtistCountryColumns(env.DB);
  await ensureArtistAgencyColumn(env.DB);

  await ensureArtist(env, artistId, user.id);

  const body = await readJson(request);
  const agencyRaw = typeof body.agency === "string" ? body.agency : null;
  const normalizedAgencyValue = agencyRaw ? agencyRaw.trim() : "";
  const agency = normalizedAgencyValue.length > 0 ? normalizedAgencyValue : null;
  const tags = sanitizeArtistTags(body.tags);

  const updateResult = await env.DB
    .prepare("UPDATE artists SET agency = ? WHERE id = ?")
    .bind(agency, artistId)
    .run();
  if (!updateResult.success) {
    throw new HttpError(500, updateResult.error ?? "Failed to update artist profile");
  }

  const deleteTagsResult = await env.DB
    .prepare("DELETE FROM artist_tags WHERE artist_id = ?")
    .bind(artistId)
    .run();
  if (!deleteTagsResult.success) {
    throw new HttpError(500, deleteTagsResult.error ?? "Failed to update artist tags");
  }

  for (const tag of tags) {
    const tagResult = await env.DB
      .prepare("INSERT OR IGNORE INTO artist_tags (artist_id, tag) VALUES (?, ?)")
      .bind(artistId, tag)
      .run();
    if (!tagResult.success) {
      console.warn(
        `[yt-clip] Failed to persist artist tag ${tag} for artist ${artistId}: ${tagResult.error ?? "unknown error"}`
      );
    }
  }

  const artistRow = await env.DB
    .prepare(
      `SELECT a.id,
              a.name,
              a.display_name,
              a.youtube_channel_id,
              a.youtube_channel_title,
              a.profile_image_url,
              a.available_ko,
              a.available_en,
              a.available_jp,
              a.agency,
              GROUP_CONCAT(at.tag, char(31)) AS tags
         FROM artists a
         LEFT JOIN artist_tags at ON at.artist_id = a.id
        WHERE a.id = ?
     GROUP BY a.id`
    )
    .bind(artistId)
    .first<ArtistQueryRow>();

  if (!artistRow) {
    throw new HttpError(404, `Artist not found: ${artistId}`);
  }

  const normalizedRow = normalizeArtistRow(artistRow);
  const hydratedRow = await refreshArtistMetadataIfNeeded(env, normalizedRow);
  const responsePayload = toArtistResponse(hydratedRow);

  return jsonResponse(responsePayload, 200, cors);
}

async function listArtists(
  url: URL,
  env: Env,
  user: UserContext | null,
  cors: CorsConfig
): Promise<Response> {
  const mine = url.searchParams.get("mine") === "true";
  await ensureArtistUpdatedAtColumn(env.DB);
  await ensureArtistDisplayNameColumn(env.DB);
  await ensureArtistProfileImageColumn(env.DB);
  await ensureArtistChannelTitleColumn(env.DB);
  await ensureArtistCountryColumns(env.DB);
  await ensureArtistAgencyColumn(env.DB);
  let results: ArtistQueryRow[] | null | undefined;
  if (mine) {
    const requestingUser = requireUser(user);
    const response = await env.DB.prepare(
      `SELECT a.id,
              a.name,
              a.display_name,
              a.youtube_channel_id,
              a.youtube_channel_title,
              a.profile_image_url,
              a.available_ko,
              a.available_en,
              a.available_jp,
              a.agency,
              GROUP_CONCAT(at.tag, char(31)) AS tags
         FROM artists a
         JOIN user_favorite_artists ufa ON ufa.artist_id = a.id
         LEFT JOIN artist_tags at ON at.artist_id = a.id
        WHERE ufa.user_id = ?
     GROUP BY a.id
        ORDER BY a.name`
    )
      .bind(requestingUser.id)
      .all<ArtistQueryRow>();
    results = response.results;
  } else {
    const response = await env.DB.prepare(
      `SELECT a.id,
              a.name,
              a.display_name,
              a.youtube_channel_id,
              a.youtube_channel_title,
              a.profile_image_url,
              a.available_ko,
              a.available_en,
              a.available_jp,
              a.agency,
              GROUP_CONCAT(at.tag, char(31)) AS tags
         FROM artists a
         LEFT JOIN artist_tags at ON at.artist_id = a.id
     GROUP BY a.id
        ORDER BY a.id DESC`
    ).all<ArtistQueryRow>();
    results = response.results;
  }
  const rows = (results ?? []).map(normalizeArtistRow);
  const hydrated = await Promise.all(rows.map((row) => refreshArtistMetadataIfNeeded(env, row)));
  const artists = hydrated.map(toArtistResponse);
  return jsonResponse(artists, 200, cors);
}

async function toggleFavorite(
  request: Request,
  env: Env,
  user: UserContext,
  cors: CorsConfig
): Promise<Response> {
  const body = await readJson(request);
  const artistId = Number(body.artistId);
  if (!Number.isFinite(artistId)) {
    throw new HttpError(400, "artistId must be a number");
  }
  const artist = await env.DB.prepare("SELECT id FROM artists WHERE id = ?").bind(artistId).first<{ id: number }>();
  if (!artist) {
    throw new HttpError(404, `Artist not found: ${artistId}`);
  }
  const existing = await env.DB.prepare(
    "SELECT 1 FROM user_favorite_artists WHERE user_id = ? AND artist_id = ?"
  ).bind(user.id, artistId).first<{ 1: number }>();
  if (existing) {
    await env.DB.prepare(
      "DELETE FROM user_favorite_artists WHERE user_id = ? AND artist_id = ?"
    ).bind(user.id, artistId).run();
  } else {
    await env.DB.prepare(
      "INSERT INTO user_favorite_artists (user_id, artist_id) VALUES (?, ?)"
    ).bind(user.id, artistId).run();
  }
  return emptyResponse(204, cors);
}

interface VideoUrlResolutionParams {
  artistId: number;
  videoUrl: string;
  description?: string | null;
  captionsJson?: string | null;
  originalComposer?: string | null;
  category?: string | null;
}

async function getOrCreateVideoByUrl(
  env: Env,
  user: UserContext,
  params: VideoUrlResolutionParams
): Promise<{ row: VideoRow; created: boolean }> {
  const { artistId, videoUrl } = params;
  await ensureArtistExists(env, artistId);
  await ensureVideoContentTypeColumn(env.DB);
  await ensureVideoHiddenColumn(env.DB);
  await ensureVideoCategoryColumn(env.DB);
  await ensureVideoOriginalComposerColumn(env.DB);
  await ensureVideoArtistsTable(env.DB);

  const videoId = extractVideoId(videoUrl);
  if (!videoId) {
    throw new HttpError(400, "Unable to parse videoId from URL");
  }

  const metadata = await testOverrides.fetchVideoMetadata(env, videoId);

  const derivedCategory = deriveVideoCategoryFromTitle(metadata.title);

  const hasCategory = Object.prototype.hasOwnProperty.call(params, "category");
  let providedCategory: string | null | undefined = undefined;
  if (hasCategory) {
    const rawCategory = (params as { category?: unknown }).category;
    if (typeof rawCategory === "string") {
      const sanitized = sanitizeOptionalText(rawCategory);
      providedCategory = sanitized === null ? null : sanitized.toLowerCase();
    } else if (rawCategory === null) {
      providedCategory = null;
    } else if (rawCategory !== undefined) {
      throw new HttpError(400, "category must be a string or null");
    }
  }

  let description = params.description ?? null;
  if (!description && metadata.description) {
    description = metadata.description;
  }

  const captionsJson = params.captionsJson ?? null;
  const originalComposerInput = params.originalComposer;
  const sanitizedOriginalComposer =
    typeof originalComposerInput === "string"
      ? sanitizeOptionalText(originalComposerInput)
      : originalComposerInput === null
        ? null
        : undefined;

  const existing = await env.DB.prepare(
    `SELECT *
       FROM videos
      WHERE youtube_video_id = ?`
  )
    .bind(videoId)
    .first<VideoRow | null>();

  if (existing) {
    const primaryArtistId = existing.artist_id ?? artistId;

    const nextOriginalComposer = sanitizedOriginalComposer ?? existing.original_composer ?? null;
    const nextCategory =
      providedCategory === undefined ? existing.category ?? derivedCategory : providedCategory;

    const updateResult = await env.DB.prepare(
      `UPDATE videos
          SET artist_id = ?,
              title = ?,
              duration_sec = ?,
              thumbnail_url = ?,
              channel_id = ?,
              description = ?,
              captions_json = ?,
              category = ?,
              original_composer = ?,
              content_type = ?,
              hidden = ?
        WHERE id = ?`
    )
      .bind(
        primaryArtistId,
        metadata.title ?? "Untitled",
        metadata.durationSec,
        metadata.thumbnailUrl,
        metadata.channelId,
        description,
        captionsJson,
        nextCategory,
        nextOriginalComposer,
        "OFFICIAL",
        0,
        existing.id
      )
      .run();

    if (!updateResult.success) {
      throw new HttpError(500, updateResult.error ?? "Failed to update video");
    }

    await upsertVideoArtistLink(env, existing.id, artistId, primaryArtistId === artistId);
    await upsertVideoArtistLink(env, existing.id, primaryArtistId, true);
    await setVideoPrimaryArtist(env, existing.id, primaryArtistId);

    const row = await env.DB.prepare("SELECT * FROM videos WHERE id = ?")
      .bind(existing.id)
      .first<VideoRow>();
    if (!row) {
      throw new HttpError(500, "Failed to load updated video");
    }
    return { row, created: false };
  }

  const insertOriginalComposer = sanitizedOriginalComposer ?? null;
  const insertCategory = providedCategory === undefined ? derivedCategory : providedCategory;
  const insertResult = await env.DB.prepare(
    `INSERT INTO videos (artist_id, youtube_video_id, title, duration_sec, thumbnail_url, channel_id, description, captions_json, category, original_composer, content_type, hidden)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      artistId,
      videoId,
      metadata.title ?? "Untitled",
      metadata.durationSec,
      metadata.thumbnailUrl,
      metadata.channelId,
      description,
      captionsJson,
      insertCategory,
      insertOriginalComposer,
      "OFFICIAL",
      0
    )
    .run();

  if (!insertResult.success) {
    throw new HttpError(500, insertResult.error ?? "Failed to insert video");
  }

  const insertedId = numberFromRowId(insertResult.meta.last_row_id);
  await upsertVideoArtistLink(env, insertedId, artistId, true);
  await setVideoPrimaryArtist(env, insertedId, artistId);
  const row = await env.DB.prepare("SELECT * FROM videos WHERE id = ?")
    .bind(insertedId)
    .first<VideoRow>();
  if (!row) {
    throw new HttpError(500, "Failed to load created video");
  }
  return { row, created: true };
}

async function createVideo(
  request: Request,
  env: Env,
  user: UserContext,
  cors: CorsConfig
): Promise<Response> {
  const body = await readJson(request);
  const artistId = Number(body.artistId);
  if (!Number.isFinite(artistId)) {
    throw new HttpError(400, "artistId must be a number");
  }

  const videoUrl = typeof body.videoUrl === "string" ? body.videoUrl : "";
  const description = sanitizeMultilineText(body.description);
  const captionsJson = typeof body.captionsJson === "string" ? body.captionsJson : null;
  const originalComposerValue =
    typeof body.originalComposer === "string"
      ? sanitizeOptionalText(body.originalComposer)
      : body.originalComposer === null
        ? null
        : undefined;

  let categoryValue: string | null | undefined = undefined;
  const hasCategory = Object.prototype.hasOwnProperty.call(body, "category");
  if (hasCategory) {
    const rawCategory = (body as { category?: unknown }).category;
    if (typeof rawCategory === "string") {
      const sanitized = sanitizeOptionalText(rawCategory);
      categoryValue = sanitized === null ? null : sanitized.toLowerCase();
    } else if (rawCategory === null) {
      categoryValue = null;
    } else if (rawCategory !== undefined) {
      throw new HttpError(400, "category must be a string or null");
    }
  }

  const { row, created } = await getOrCreateVideoByUrl(env, user, {
    artistId,
    videoUrl,
    description,
    captionsJson,
    ...(originalComposerValue !== undefined ? { originalComposer: originalComposerValue } : {}),
    ...(hasCategory ? { category: categoryValue ?? null } : {})
  });

  const hydrated = await hydrateVideoRow(env, row);

  return jsonResponse(hydrated, created ? 201 : 200, cors);
}

async function updateVideoCategory(
  request: Request,
  env: Env,
  user: UserContext,
  cors: CorsConfig,
  videoIdParam: number
): Promise<Response> {
  const videoId = Number(videoIdParam);
  if (!Number.isFinite(videoId)) {
    throw new HttpError(400, "videoId must be a number");
  }

  const existing = await env.DB.prepare(
    `SELECT *
       FROM videos
      WHERE id = ?`
  )
    .bind(videoId)
    .first<VideoRow | null>();

  if (!existing) {
    throw new HttpError(404, `Video not found: ${videoId}`);
  }

  const body = await readJson(request);
  if (!Object.prototype.hasOwnProperty.call(body, "category")) {
    throw new HttpError(400, "category must be provided");
  }

  const rawCategory = (body as { category?: unknown }).category;
  let providedCategory: string | null | undefined = undefined;
  if (typeof rawCategory === "string") {
    const sanitized = sanitizeOptionalText(rawCategory);
    providedCategory = sanitized === null ? null : sanitized.toLowerCase();
  } else if (rawCategory === null) {
    providedCategory = null;
  } else if (rawCategory === undefined) {
    providedCategory = undefined;
  } else {
    throw new HttpError(400, "category must be a string or null");
  }

  const resolvedCategory =
    providedCategory === undefined ? deriveVideoCategoryFromTitle(existing.title) : providedCategory;

  const updateResult = await env.DB.prepare("UPDATE videos SET category = ? WHERE id = ?")
    .bind(resolvedCategory, videoId)
    .run();

  if (!updateResult.success) {
    throw new HttpError(500, updateResult.error ?? "Failed to update video category");
  }

  const row = await env.DB.prepare("SELECT * FROM videos WHERE id = ?")
    .bind(videoId)
    .first<VideoRow>();

  if (!row) {
    throw new HttpError(500, "Failed to load updated video");
  }

  return jsonResponse(await hydrateVideoRow(env, row), 200, cors);
}

async function updateVideoMetadata(
  request: Request,
  env: Env,
  _user: UserContext,
  cors: CorsConfig,
  videoIdParam: number
): Promise<Response> {
  const videoId = Number(videoIdParam);
  if (!Number.isFinite(videoId)) {
    throw new HttpError(400, "videoId must be a number");
  }

  await ensureVideoExists(env, videoId);
  await ensureVideoOriginalComposerColumn(env.DB);

  const body = await readJson(request);

  const setClauses: string[] = [];
  const values: unknown[] = [];

  if (Object.prototype.hasOwnProperty.call(body, "title")) {
    const rawTitle = (body as { title?: unknown }).title;
    if (typeof rawTitle !== "string") {
      throw new HttpError(400, "title must be a string");
    }
    const trimmedTitle = rawTitle.trim();
    if (trimmedTitle.length === 0) {
      throw new HttpError(400, "title cannot be empty");
    }
    setClauses.push("title = ?");
    values.push(trimmedTitle);
  }

  if (Object.prototype.hasOwnProperty.call(body, "originalComposer")) {
    const rawComposer = (body as { originalComposer?: unknown }).originalComposer;
    if (typeof rawComposer === "string") {
      const trimmedComposer = rawComposer.trim();
      setClauses.push("original_composer = ?");
      values.push(trimmedComposer.length > 0 ? trimmedComposer : null);
    } else if (rawComposer === null) {
      setClauses.push("original_composer = ?");
      values.push(null);
    } else if (rawComposer !== undefined) {
      throw new HttpError(400, "originalComposer must be a string or null");
    }
  }

  if (setClauses.length === 0) {
    throw new HttpError(400, "No updatable fields provided");
  }

  const updateResult = await env.DB.prepare(
    `UPDATE videos SET ${setClauses.join(", ")} WHERE id = ?`
  )
    .bind(...values, videoId)
    .run();

  if (!updateResult.success) {
    throw new HttpError(500, updateResult.error ?? "Failed to update video metadata");
  }

  const row = await env.DB.prepare("SELECT * FROM videos WHERE id = ?")
    .bind(videoId)
    .first<VideoRow>();

  if (!row) {
    throw new HttpError(500, "Failed to load updated video");
  }

  return jsonResponse(await hydrateVideoRow(env, row), 200, cors);
}

async function suggestClipCandidates(
  request: Request,
  env: Env,
  user: UserContext,
  cors: CorsConfig
): Promise<Response> {
  const body = await readJson(request);
  const artistId = Number(body.artistId);
  if (!Number.isFinite(artistId)) {
    throw new HttpError(400, "artistId must be a number");
  }

  const videoUrl = typeof body.videoUrl === "string" ? body.videoUrl : "";

  let categoryValue: string | null | undefined = undefined;
  const hasCategory = Object.prototype.hasOwnProperty.call(body, "category");
  if (hasCategory) {
    const rawCategory = (body as { category?: unknown }).category;
    if (typeof rawCategory === "string") {
      const sanitized = sanitizeOptionalText(rawCategory);
      categoryValue = sanitized === null ? null : sanitized.toLowerCase();
    } else if (rawCategory === null) {
      categoryValue = null;
    } else if (rawCategory !== undefined) {
      throw new HttpError(400, "category must be a string or null");
    }
  }

  const { row } = await getOrCreateVideoByUrl(env, user, {
    artistId,
    videoUrl,
    ...(hasCategory ? { category: categoryValue ?? null } : {})
  });

  const candidates = await detectClipCandidatesForVideo(env, row, "chapters");

  return jsonResponse(
    {
      video: await hydrateVideoRow(env, row),
      candidates
    },
    200,
    cors
  );
}

async function listVideos(
  url: URL,
  env: Env,
  _user: UserContext | null,
  cors: CorsConfig
): Promise<Response> {
  const artistIdParam = url.searchParams.get("artistId");
  const artistId = artistIdParam ? Number(artistIdParam) : NaN;
  if (!Number.isFinite(artistId)) {
    throw new HttpError(400, "artistId query parameter is required");
  }
  await ensureArtistExists(env, artistId);
  await ensureVideoContentTypeColumn(env.DB);
  await ensureVideoHiddenColumn(env.DB);
  await ensureVideoCategoryColumn(env.DB);
  await ensureVideoOriginalComposerColumn(env.DB);
  await ensureVideoArtistsTable(env.DB);

  const requestedContentType = normalizeVideoContentType(url.searchParams.get("contentType"));

  const baseQuery = `SELECT
        v.id,
        v.artist_id,
        v.youtube_video_id,
        v.title,
        v.duration_sec,
        v.thumbnail_url,
        v.channel_id,
        v.description,
        v.captions_json,
        v.category,
        v.content_type,
        v.hidden,
        v.original_composer,
        a.name AS artist_name,
        a.display_name AS artist_display_name,
        a.youtube_channel_id AS artist_youtube_channel_id,
        a.youtube_channel_title AS artist_youtube_channel_title,
        a.profile_image_url AS artist_profile_image_url,
        va.artist_id AS requested_artist_id
      FROM video_artists va
      JOIN videos v ON v.id = va.video_id
      LEFT JOIN artists a ON a.id = v.artist_id
     WHERE va.artist_id = ?
       AND COALESCE(v.hidden, 0) = 0`;

  let statement: D1PreparedStatement;
  if (requestedContentType) {
    statement = env.DB.prepare(`${baseQuery}
       AND v.content_type = ?
     ORDER BY v.id DESC`).bind(artistId, requestedContentType);
  } else {
    statement = env.DB.prepare(`${baseQuery}
     ORDER BY v.id DESC`).bind(artistId);
  }

  const { results } = await statement.all<VideoLibraryRow>();
  const rows = results ?? [];
  const filteredRows = rows.filter((row) => normalizeVideoCategory(row.category) !== "live");
  const videoIds = filteredRows.map((row) => row.id);
  const artistMap = await fetchVideoArtistMap(env, videoIds);
  const videos = filteredRows.map((row) =>
    toVideoLibraryResponse(row, {
      artists: artistMap.get(row.id) ?? [],
      currentArtistId: row.requested_artist_id ?? artistId
    })
  );
  return jsonResponse(videos, 200, cors);
}

async function listMediaLibrary(env: Env, user: UserContext | null, cors: CorsConfig): Promise<Response> {
  requireUser(user);

  const payload = await loadMediaLibrary(env, { includeHidden: true });
  return jsonResponse(payload, 200, cors);
}

async function listPublicLibrary(env: Env, cors: CorsConfig): Promise<Response> {
  const payload = await loadMediaLibrary(env, { includeHidden: false });
  return jsonResponse(payload, 200, cors);
}

async function loadMediaLibrary(
  env: Env,
  options: { includeHidden: boolean }
): Promise<{ videos: VideoResponse[]; clips: ClipResponse[]; songVideos: VideoResponse[] }> {
  await ensureArtistDisplayNameColumn(env.DB);
  await ensureArtistProfileImageColumn(env.DB);
  await ensureArtistChannelTitleColumn(env.DB);
  await ensureVideoContentTypeColumn(env.DB);
  await ensureVideoHiddenColumn(env.DB);
  await ensureVideoCategoryColumn(env.DB);
  await ensureVideoOriginalComposerColumn(env.DB);
  await ensureClipOriginalComposerColumn(env.DB);
  await ensureVideoArtistsTable(env.DB);

  const predicates: string[] = [];
  if (!options.includeHidden) {
    predicates.push("COALESCE(v.hidden, 0) = 0");
  }
  const visibilityPredicate = predicates.length > 0 ? `WHERE ${predicates.join(" AND ")}` : "";

  const { results } = await env.DB.prepare(
    `SELECT
        v.id,
        v.artist_id,
        v.youtube_video_id,
        v.title,
        v.duration_sec,
        v.thumbnail_url,
        v.channel_id,
        v.description,
        v.captions_json,
        v.category,
        v.content_type,
        v.hidden,
        v.original_composer,
        v.created_at,
        v.updated_at,
        a.name AS artist_name,
        a.display_name AS artist_display_name,
        a.youtube_channel_id AS artist_youtube_channel_id,
        a.youtube_channel_title AS artist_youtube_channel_title,
        a.profile_image_url AS artist_profile_image_url
      FROM videos v
      LEFT JOIN artists a ON a.id = v.artist_id
      ${visibilityPredicate}
     ORDER BY v.id DESC`
  ).all<VideoLibraryRow>();

  const videoRows = results ?? [];
  const videoIds = videoRows.map((row) => row.id);
  const artistMap = await fetchVideoArtistMap(env, videoIds);
  const videos = videoRows.map((row) =>
    toVideoLibraryResponse(row, { artists: artistMap.get(row.id) ?? [] })
  );

  const songVideos = videos.filter((video) => {
    const contentType = (video.contentType ?? "").toUpperCase();
    if (contentType === "CLIP_SOURCE") {
      return false;
    }
    const category = (video.category ?? "").toLowerCase();
    if (category === "live") {
      return false;
    }
    return true;
  });

  if (videos.length === 0) {
    return { videos, clips: [], songVideos };
  }

  const libraryVideoIds = videos.map((video) => video.id);
  const placeholders = libraryVideoIds.map(() => "?").join(", ");
  const { results: clipRows } = await env.DB.prepare(
    `SELECT id, video_id, title, start_sec, end_sec, original_composer, created_at
       FROM clips
      WHERE video_id IN (${placeholders})
      ORDER BY video_id, start_sec`
  )
    .bind(...libraryVideoIds)
    .all<ClipRow>();

  const clips = await attachTags(env, clipRows ?? [], { includeVideoMeta: true });

  return { videos, clips, songVideos };
}

async function createClip(
  request: Request,
  env: Env,
  user: UserContext,
  cors: CorsConfig
): Promise<Response> {
  const body = await readJson(request);
  const rawVideoId = Number(body.videoId);
  const videoUrl = typeof body.videoUrl === "string" ? body.videoUrl.trim() : "";
  const artistIdParam = Number(body.artistId);
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const startSec = Number(body.startSec);
  const endSec = Number(body.endSec);
  const tags = Array.isArray(body.tags) ? body.tags : [];
  const videoHiddenFlag = typeof body.videoHidden === "boolean" ? body.videoHidden : false;
  const clipOriginalComposer =
    typeof body.originalComposer === "string"
      ? sanitizeOptionalText(body.originalComposer)
      : body.originalComposer === null
        ? null
        : undefined;

  if (!title) {
    throw new HttpError(400, "title is required");
  }
  if (!Number.isFinite(startSec) || !Number.isFinite(endSec)) {
    throw new HttpError(400, "startSec and endSec must be numbers");
  }
  if (endSec <= startSec) {
    throw new HttpError(400, "endSec must be greater than startSec");
  }
  await ensureVideoContentTypeColumn(env.DB);
  await ensureVideoHiddenColumn(env.DB);
  await ensureVideoCategoryColumn(env.DB);
  await ensureVideoOriginalComposerColumn(env.DB);
  await ensureClipOriginalComposerColumn(env.DB);

  let resolvedVideoId: number | null = Number.isFinite(rawVideoId) ? rawVideoId : null;

  if (!resolvedVideoId && !videoUrl) {
    throw new HttpError(400, "videoId or videoUrl is required to create a clip");
  }

  if (videoUrl) {
    if (!Number.isFinite(artistIdParam)) {
      throw new HttpError(400, "artistId must be provided when registering a clip source");
    }
    await ensureArtistExists(env, artistIdParam);

    const extractedVideoId = extractVideoId(videoUrl);
    if (!extractedVideoId) {
      throw new HttpError(400, "Unable to parse videoId from URL");
    }

    const existingVideo = await env.DB
      .prepare("SELECT * FROM videos WHERE youtube_video_id = ?")
      .bind(extractedVideoId)
      .first<VideoRow>();

    if (existingVideo) {
      const association = await env.DB
        .prepare("SELECT 1 FROM video_artists WHERE video_id = ? AND artist_id = ?")
        .bind(existingVideo.id, artistIdParam)
        .first<{ 1: number }>();
      if (!association) {
        throw new HttpError(400, "Video is already registered for a different artist");
      }
      resolvedVideoId = existingVideo.id;
      if (clipOriginalComposer !== undefined) {
        await env.DB.prepare("UPDATE videos SET original_composer = ? WHERE id = ?")
          .bind(clipOriginalComposer, existingVideo.id)
          .run();
      }
      if (normalizeVideoContentType(existingVideo.content_type) !== "CLIP_SOURCE") {
        await env.DB.prepare("UPDATE videos SET content_type = ? WHERE id = ?")
          .bind("CLIP_SOURCE", existingVideo.id)
          .run();
      }
    } else {
      const metadata = await fetchVideoMetadata(env, extractedVideoId);
      const clipCategory = deriveVideoCategoryFromTitle(metadata.title);
      const insertClipSource = await env.DB
        .prepare(
          `INSERT INTO videos (artist_id, youtube_video_id, title, duration_sec, thumbnail_url, channel_id, description, captions_json, category, original_composer, content_type, hidden)
           VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`
        )
        .bind(
          artistIdParam,
          extractedVideoId,
          metadata.title ?? "Untitled",
          metadata.durationSec,
          metadata.thumbnailUrl,
          metadata.channelId,
          metadata.description,
          clipCategory,
          clipOriginalComposer ?? null,
          "CLIP_SOURCE",
          videoHiddenFlag ? 1 : 0
        )
        .run();
      if (!insertClipSource.success) {
        throw new HttpError(500, insertClipSource.error ?? "Failed to register clip source video");
      }
      resolvedVideoId = numberFromRowId(insertClipSource.meta.last_row_id);
      await upsertVideoArtistLink(env, resolvedVideoId, artistIdParam, true);
      await setVideoPrimaryArtist(env, resolvedVideoId, artistIdParam);
    }
  }

  if (resolvedVideoId === null) {
    throw new HttpError(400, "Unable to determine video for clip creation");
  }

  await ensureVideoExists(env, resolvedVideoId);

  const existingContentType = await env.DB
    .prepare("SELECT content_type FROM videos WHERE id = ?")
    .bind(resolvedVideoId)
    .first<{ content_type: string | null }>();
  if (normalizeVideoContentType(existingContentType?.content_type ?? null) !== "CLIP_SOURCE") {
    await env.DB.prepare("UPDATE videos SET content_type = ? WHERE id = ?")
      .bind("CLIP_SOURCE", resolvedVideoId)
      .run();
  }

  const duplicateClip = await env.DB
    .prepare(
      `SELECT id
         FROM clips
        WHERE video_id = ?
          AND start_sec = ?
          AND end_sec = ?`
    )
    .bind(resolvedVideoId, startSec, endSec)
    .first<Pick<ClipRow, "id">>();
  if (duplicateClip) {
    throw new HttpError(409, "A clip with the same time range already exists for this video");
  }

  const insertResult = await env.DB.prepare(
    `INSERT INTO clips (video_id, title, start_sec, end_sec, original_composer) VALUES (?, ?, ?, ?, ?)`
  )
    .bind(resolvedVideoId, title, startSec, endSec, clipOriginalComposer ?? null)
    .run();
  if (!insertResult.success) {
    throw new HttpError(500, insertResult.error ?? "Failed to insert clip");
  }
  const clipId = numberFromRowId(insertResult.meta.last_row_id);

  const normalizedTags = tags
    .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
    .filter((tag) => tag.length > 0);
  for (const tag of normalizedTags) {
    await env.DB.prepare("INSERT INTO clip_tags (clip_id, tag) VALUES (?, ?)").bind(clipId, tag).run();
  }

  const clipRow = await env.DB
    .prepare(
      "SELECT id, video_id, title, start_sec, end_sec, original_composer, created_at FROM clips WHERE id = ?"
    )
    .bind(clipId)
    .first<ClipRow>();
  if (!clipRow) {
    throw new HttpError(500, "Failed to load created clip");
  }
  const clip = await attachTags(env, [clipRow], { includeVideoMeta: true });
  return jsonResponse(clip[0], 201, cors);
}

async function updateClip(
  request: Request,
  env: Env,
  user: UserContext,
  cors: CorsConfig,
  clipId: number
): Promise<Response> {
  if (!Number.isFinite(clipId)) {
    throw new HttpError(400, "clipId must be a number");
  }

  const existingClip = await env.DB.prepare(
    `SELECT c.id, c.video_id, c.title, c.start_sec, c.end_sec, c.original_composer, c.created_at
       FROM clips c
       JOIN videos v ON v.id = c.video_id
      WHERE c.id = ?`
  )
    .bind(clipId)
    .first<ClipRow>();

  if (!existingClip) {
    throw new HttpError(404, `Clip not found: ${clipId}`);
  }

  const body = await readJson(request);

  const requestedVideoIdRaw = body.videoId ?? body.video_id;
  if (typeof requestedVideoIdRaw !== "undefined" && requestedVideoIdRaw !== null) {
    const requestedVideoId = Number(requestedVideoIdRaw);
    if (!Number.isFinite(requestedVideoId)) {
      throw new HttpError(400, "videoId must be a number");
    }
    if (requestedVideoId !== existingClip.video_id) {
      throw new HttpError(404, `Clip not found: ${clipId}`);
    }
  }

  const parseTimeField = (value: unknown, field: string): number => {
    if (typeof value === "number") {
      return value;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        throw new HttpError(400, `${field} must be provided`);
      }
      const numeric = Number(trimmed);
      if (Number.isFinite(numeric)) {
        return numeric;
      }
    }
    throw new HttpError(400, `${field} must be a number`);
  };

  const startSec = parseTimeField(body.startSec, "startSec");
  const endSec = parseTimeField(body.endSec, "endSec");

  if (!Number.isFinite(startSec) || !Number.isFinite(endSec)) {
    throw new HttpError(400, "startSec and endSec must be numbers");
  }

  if (endSec <= startSec) {
    throw new HttpError(400, "endSec must be greater than startSec");
  }

  const duplicateClip = await env.DB
    .prepare(
      `SELECT id
         FROM clips
        WHERE video_id = ?
          AND id != ?
          AND start_sec = ?
          AND end_sec = ?`
    )
    .bind(existingClip.video_id, clipId, startSec, endSec)
    .first<Pick<ClipRow, "id">>();

  if (duplicateClip) {
    throw new HttpError(409, "A clip with the same time range already exists for this video");
  }

  const updateResult = await env.DB
    .prepare("UPDATE clips SET start_sec = ?, end_sec = ? WHERE id = ?")
    .bind(startSec, endSec, clipId)
    .run();

  if (!updateResult.success) {
    throw new HttpError(500, updateResult.error ?? "Failed to update clip");
  }

  const updatedClipRow = await env.DB
    .prepare(
      "SELECT id, video_id, title, start_sec, end_sec, original_composer, created_at FROM clips WHERE id = ?"
    )
    .bind(clipId)
    .first<ClipRow>();

  if (!updatedClipRow) {
    throw new HttpError(500, "Failed to load updated clip");
  }

  const [updatedClip] = await attachTags(env, [updatedClipRow], { includeVideoMeta: true });

  return jsonResponse(updatedClip, 200, cors);
}

async function listClips(
  url: URL,
  env: Env,
  _user: UserContext | null,
  cors: CorsConfig
): Promise<Response> {
  const artistIdParam = url.searchParams.get("artistId");
  const videoIdParam = url.searchParams.get("videoId");
  await ensureClipOriginalComposerColumn(env.DB);
  await ensureVideoOriginalComposerColumn(env.DB);
  await ensureVideoArtistsTable(env.DB);
  if (artistIdParam) {
    const artistId = Number(artistIdParam);
    if (!Number.isFinite(artistId)) {
      throw new HttpError(400, "artistId must be a number");
    }
    await ensureArtistExists(env, artistId);
    const { results } = await env.DB.prepare(
      `SELECT c.id, c.video_id, c.title, c.start_sec, c.end_sec, c.original_composer, c.created_at
         FROM clips c
         JOIN video_artists va ON va.video_id = c.video_id
        WHERE va.artist_id = ?
        ORDER BY c.start_sec`
    ).bind(artistId).all<ClipRow>();
    const clips = await attachTags(env, results ?? [], { includeVideoMeta: true });
    return jsonResponse(clips, 200, cors);
  }
  if (videoIdParam) {
    const videoId = Number(videoIdParam);
    if (!Number.isFinite(videoId)) {
      throw new HttpError(400, "videoId must be a number");
    }
    await ensureVideoExists(env, videoId);
    const { results } = await env.DB.prepare(
      `SELECT id, video_id, title, start_sec, end_sec, original_composer, created_at
         FROM clips
        WHERE video_id = ?
        ORDER BY start_sec`
    ).bind(videoId).all<ClipRow>();
    const clips = await attachTags(env, results ?? [], { includeVideoMeta: true });
    return jsonResponse(clips, 200, cors);
  }
  throw new HttpError(400, "artistId or videoId query parameter is required");
}

async function listPlaylists(env: Env, user: UserContext, cors: CorsConfig): Promise<Response> {
  const { results } = await env.DB
    .prepare(
      `SELECT id, owner_id, title, visibility, created_at, updated_at
         FROM playlists
        WHERE owner_id = ?
        ORDER BY updated_at DESC, id DESC`
    )
    .bind(user.id)
    .all<PlaylistRow>();

  const playlists = await hydratePlaylists(env, results ?? [], user);
  return jsonResponse(playlists, 200, cors);
}

async function createPlaylist(
  request: Request,
  env: Env,
  user: UserContext,
  cors: CorsConfig
): Promise<Response> {
  const body = await readJson(request);
  const rawTitle = typeof body.title === "string" ? body.title.trim() : "";
  if (!rawTitle) {
    throw new HttpError(400, "title is required");
  }
  if (rawTitle.length > 200) {
    throw new HttpError(400, "title must be 200 characters or fewer");
  }

  const visibility = normalizePlaylistVisibility(body.visibility);

  const insertResult = await env.DB
    .prepare("INSERT INTO playlists (owner_id, title, visibility) VALUES (?, ?, ?)")
    .bind(user.id, rawTitle, visibility)
    .run();

  if (!insertResult.success) {
    throw new HttpError(500, insertResult.error ?? "Failed to create playlist");
  }

  const playlistId = insertResult.meta.last_row_id;
  if (!playlistId) {
    throw new HttpError(500, "Failed to resolve playlist identifier");
  }

  const playlist = await loadPlaylistForUser(env, Number(playlistId), user);
  return jsonResponse(playlist, 201, cors);
}

async function addPlaylistItem(
  request: Request,
  env: Env,
  user: UserContext,
  cors: CorsConfig,
  playlistIdParam: number
): Promise<Response> {
  const playlistId = Number(playlistIdParam);
  if (!Number.isFinite(playlistId)) {
    throw new HttpError(400, "playlistId must be a number");
  }

  await ensurePlaylistOwner(env, playlistId, user);

  const body = await readJson(request);
  const maybeVideoId = Number(body.videoId);
  const maybeClipId = Number(body.clipId);
  const hasVideo = Number.isFinite(maybeVideoId);
  const hasClip = Number.isFinite(maybeClipId);

  if ((hasVideo && hasClip) || (!hasVideo && !hasClip)) {
    throw new HttpError(400, "Either videoId or clipId must be provided");
  }

  let videoId: number | null = null;
  let clipId: number | null = null;

  if (hasVideo) {
    videoId = maybeVideoId;
    await ensureVideoExists(env, videoId);
  }

  if (hasClip) {
    clipId = maybeClipId;
    const clip = await env.DB
      .prepare("SELECT id, video_id FROM clips WHERE id = ?")
      .bind(clipId)
      .first<{ id: number; video_id: number }>();
    if (!clip) {
      throw new HttpError(404, `Clip not found: ${clipId}`);
    }
  }

  let ordering: number;
  if (Number.isFinite(Number(body.ordering))) {
    ordering = Math.max(0, Math.floor(Number(body.ordering)));
  } else {
    const nextOrderRow = await env.DB
      .prepare(
        `SELECT COALESCE(MAX(ordering), 0) + 1 AS next_order
           FROM playlist_items
          WHERE playlist_id = ?`
      )
      .bind(playlistId)
      .first<{ next_order: number | null }>();
    ordering = Number(nextOrderRow?.next_order ?? 1);
  }

  const insertResult = await env.DB
    .prepare(
      "INSERT INTO playlist_items (playlist_id, video_id, clip_id, ordering) VALUES (?, ?, ?, ?)"
    )
    .bind(playlistId, videoId, clipId, ordering)
    .run();

  if (!insertResult.success) {
    throw new HttpError(500, insertResult.error ?? "Failed to add playlist item");
  }

  const playlist = await loadPlaylistForUser(env, playlistId, user);
  return jsonResponse(playlist, 201, cors);
}

async function deletePlaylistItem(
  env: Env,
  user: UserContext,
  cors: CorsConfig,
  playlistIdParam: number,
  itemIdParam: number
): Promise<Response> {
  const playlistId = Number(playlistIdParam);
  const itemId = Number(itemIdParam);

  if (!Number.isFinite(playlistId) || !Number.isFinite(itemId)) {
    throw new HttpError(400, "playlistId and itemId must be numbers");
  }

  await ensurePlaylistOwner(env, playlistId, user);

  const deleteResult = await env.DB
    .prepare("DELETE FROM playlist_items WHERE id = ? AND playlist_id = ?")
    .bind(itemId, playlistId)
    .run();

  if (!deleteResult.success) {
    throw new HttpError(500, deleteResult.error ?? "Failed to remove playlist item");
  }

  if (deleteResult.meta.changes === 0) {
    throw new HttpError(404, `Playlist item not found: ${itemId}`);
  }

  const playlist = await loadPlaylistForUser(env, playlistId, user);
  return jsonResponse(playlist, 200, cors);
}

async function listPublicPlaylists(env: Env, cors: CorsConfig): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT id, owner_id, title, visibility, created_at, updated_at
       FROM playlists
      WHERE visibility = 'PUBLIC'
      ORDER BY updated_at DESC, id DESC`
  ).all<PlaylistRow>();

  const playlists = await hydratePlaylists(env, results ?? [], null);
  return jsonResponse(playlists, 200, cors);
}

type ClipDetectionMode = "chapters" | "captions" | "combined";

const normalizeDetectionMode = (modeRaw: string): ClipDetectionMode => {
  const normalized = modeRaw.trim().toLowerCase();
  if (normalized === "captions") {
    return "captions";
  }
  if (normalized === "chapters" || normalized.length === 0) {
    return "chapters";
  }
  return "combined";
};

async function detectClipCandidatesForVideo(
  env: Env,
  row: VideoRow,
  mode: ClipDetectionMode
): Promise<ClipCandidateResponse[]> {
  const video = toVideoRowDetails(row);
  const youtubeVideoId = row.youtube_video_id ? row.youtube_video_id.trim() : "";

  if (mode === "captions") {
    return testOverrides.detectFromCaptions(video);
  }

  if (mode === "chapters") {
    const chapterCandidates = youtubeVideoId
      ? await testOverrides.detectFromChapterSources(env, youtubeVideoId, video.durationSec ?? null)
      : [];
    const descriptionCandidates = testOverrides.detectFromDescription(video);
    return mergeClipCandidates(chapterCandidates, descriptionCandidates);
  }

  return mergeClipCandidates(
    testOverrides.detectFromDescription(video),
    testOverrides.detectFromCaptions(video)
  );
}

async function autoDetect(
  request: Request,
  env: Env,
  user: UserContext,
  cors: CorsConfig
): Promise<Response> {
  const body = await readJson(request);
  const videoId = Number(body.videoId);
  const modeRaw = typeof body.mode === "string" ? body.mode : "";
  if (!Number.isFinite(videoId)) {
    throw new HttpError(400, "videoId must be a number");
  }
  const row = await env.DB.prepare(
    `SELECT v.*
       FROM videos v
      WHERE v.id = ?`
  )
    .bind(videoId)
    .first<VideoRow>();
  if (!row) {
    throw new HttpError(404, `Video not found: ${videoId}`);
  }
  const mode = normalizeDetectionMode(modeRaw);
  const candidates = await detectClipCandidatesForVideo(env, row, mode);
  return jsonResponse(candidates, 200, cors);
}

async function getUserFromHeaders(env: Env, headers: Headers): Promise<UserContext | null> {
  const authorization = headers.get("Authorization");
  if (!authorization) {
    return null;
  }
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return null;
  }
  const token = match[1].trim();
  if (!token) {
    return null;
  }
  if (token.includes(".")) {
    const verified = await verifyGoogleIdToken(env, token);
    if (verified) {
      return await upsertUser(env, verified.email, verified.displayName ?? null);
    }
  }
  return null;
}

async function loginUser(request: Request, env: Env, cors: CorsConfig): Promise<Response> {
  const user = await getUserFromHeaders(env, request.headers);
  return jsonResponse(requireUser(user), 200, cors);
}

function requireUser(user: UserContext | null): UserContext {
  if (!user) {
    throw new HttpError(401, "Authentication required");
  }
  return user;
}

async function upsertUser(env: Env, email: string, displayName?: string | null): Promise<UserContext> {
  const existing = await env.DB.prepare(
    "SELECT id, email, display_name FROM users WHERE email = ?"
  ).bind(email).first<{ id: number; email: string; display_name: string | null }>();
  if (existing) {
    const normalizedDisplayName = displayName && displayName.trim() ? displayName.trim() : null;
    if (normalizedDisplayName && normalizedDisplayName !== existing.display_name) {
      await env.DB.prepare("UPDATE users SET display_name = ? WHERE id = ?")
        .bind(normalizedDisplayName, existing.id)
        .run();
      existing.display_name = normalizedDisplayName;
    }
    return { id: existing.id, email: existing.email, displayName: existing.display_name ?? null };
  }
  const normalizedDisplayName = displayName && displayName.trim() ? displayName.trim() : null;
  const insertResult = await env.DB.prepare(
    "INSERT INTO users (email, display_name) VALUES (?, ?)"
  )
    .bind(email, normalizedDisplayName)
    .run();
  if (!insertResult.success) {
    throw new HttpError(500, insertResult.error ?? "Failed to insert user");
  }
  const userId = numberFromRowId(insertResult.meta.last_row_id);
  return { id: userId, email, displayName: normalizedDisplayName };
}

async function ensureArtist(env: Env, artistId: number, userId: number): Promise<void> {
  const artist = await env.DB.prepare(
    `SELECT id
       FROM artists
      WHERE id = ?
        AND created_by = ?`
  )
    .bind(artistId, userId)
    .first<{ id: number }>();
  if (!artist) {
    throw new HttpError(404, `Artist not found: ${artistId}`);
  }
}

async function ensureArtistExists(env: Env, artistId: number): Promise<void> {
  const artist = await env.DB.prepare(
    `SELECT id
       FROM artists
      WHERE id = ?`
  )
    .bind(artistId)
    .first<{ id: number }>();
  if (!artist) {
    throw new HttpError(404, `Artist not found: ${artistId}`);
  }
}

async function ensureVideoExists(env: Env, videoId: number): Promise<void> {
  const video = await env.DB.prepare(
    `SELECT id
       FROM videos
      WHERE id = ?`
  )
    .bind(videoId)
    .first<{ id: number }>();
  if (!video) {
    throw new HttpError(404, `Video not found: ${videoId}`);
  }
}

async function ensurePlaylistOwner(env: Env, playlistId: number, user: UserContext): Promise<PlaylistRow> {
  const playlist = await env.DB
    .prepare(
      `SELECT id, owner_id, title, visibility, created_at, updated_at
         FROM playlists
        WHERE id = ?`
    )
    .bind(playlistId)
    .first<PlaylistRow>();

  if (!playlist) {
    throw new HttpError(404, `Playlist not found: ${playlistId}`);
  }

  if (playlist.owner_id !== user.id) {
    throw new HttpError(403, "You do not have permission to modify this playlist");
  }

  return playlist;
}

const canUserAccessPlaylist = (playlist: PlaylistRow, user: UserContext | null): boolean => {
  const visibility = normalizePlaylistVisibility(playlist.visibility);
  if (visibility === "PUBLIC") {
    return true;
  }
  return user?.id === playlist.owner_id;
};

const assertPlaylistAccess = (playlist: PlaylistRow, user: UserContext | null): void => {
  if (!canUserAccessPlaylist(playlist, user)) {
    throw new HttpError(403, "You do not have permission to access this playlist");
  }
};

async function loadPlaylistForUser(
  env: Env,
  playlistId: number,
  user: UserContext | null
): Promise<PlaylistResponse> {
  const playlist = await env.DB
    .prepare(
      `SELECT id, owner_id, title, visibility, created_at, updated_at
         FROM playlists
        WHERE id = ?`
    )
    .bind(playlistId)
    .first<PlaylistRow>();

  if (!playlist) {
    throw new HttpError(404, `Playlist not found: ${playlistId}`);
  }

  assertPlaylistAccess(playlist, user);

  const [hydrated] = await hydratePlaylists(env, [playlist], user);
  if (!hydrated) {
    throw new HttpError(500, "Failed to load playlist");
  }

  return hydrated;
}

async function hydratePlaylists(
  env: Env,
  playlistRows: PlaylistRow[] | undefined,
  user: UserContext | null
): Promise<PlaylistResponse[]> {
  const rows = playlistRows ?? [];
  const accessibleRows = rows.filter((row) => canUserAccessPlaylist(row, user));
  if (accessibleRows.length === 0) {
    return [];
  }

  await ensureArtistDisplayNameColumn(env.DB);
  await ensureArtistProfileImageColumn(env.DB);
  await ensureArtistChannelTitleColumn(env.DB);
  await ensureVideoContentTypeColumn(env.DB);
  await ensureVideoHiddenColumn(env.DB);
  await ensureVideoCategoryColumn(env.DB);
  await ensureVideoOriginalComposerColumn(env.DB);
  await ensureClipOriginalComposerColumn(env.DB);

  const playlistIds = accessibleRows.map((row) => row.id);
  const placeholders = playlistIds.map(() => "?").join(", ");
  const { results: itemRows } = await env.DB
    .prepare(
      `SELECT id, playlist_id, video_id, clip_id, ordering, created_at, updated_at
         FROM playlist_items
        WHERE playlist_id IN (${placeholders})
        ORDER BY playlist_id, ordering, id`
    )
    .bind(...playlistIds)
    .all<PlaylistItemRow>();

  const playlistItems = itemRows ?? [];

  const clipIds = playlistItems
    .map((row) => (typeof row.clip_id === "number" ? row.clip_id : null))
    .filter((value): value is number => value !== null);

  let clipRows: ClipRow[] = [];
  if (clipIds.length > 0) {
    const clipPlaceholders = clipIds.map(() => "?").join(", ");
    const { results: fetchedClipRows } = await env.DB
      .prepare(
        `SELECT id, video_id, title, start_sec, end_sec, original_composer, created_at
           FROM clips
          WHERE id IN (${clipPlaceholders})`
      )
      .bind(...clipIds)
      .all<ClipRow>();
    clipRows = fetchedClipRows ?? [];
  }

  const videoIdSet = new Set<number>();
  for (const row of playlistItems) {
    if (typeof row.video_id === "number") {
      videoIdSet.add(row.video_id);
    }
  }
  for (const clipRow of clipRows) {
    videoIdSet.add(clipRow.video_id);
  }

  let videoMap = new Map<number, VideoResponse>();
  if (videoIdSet.size > 0) {
    const videoIds = Array.from(videoIdSet);
    videoMap = await loadVideoResponseMap(env, videoIds);
  }

  const clipResponses =
    clipRows.length > 0 ? await attachTags(env, clipRows, { includeVideoMeta: true }) : [];
  const clipMap = new Map<number, ClipResponse>();
  for (const clip of clipResponses) {
    const video = videoMap.get(clip.videoId);
    clipMap.set(clip.id, {
      ...clip,
      artistId: video?.artistId,
      primaryArtistId: video?.primaryArtistId ?? null,
      artistName: video?.artistName,
      artistDisplayName: video?.artistDisplayName,
      artistYoutubeChannelId: video?.artistYoutubeChannelId,
      artistYoutubeChannelTitle: video?.artistYoutubeChannelTitle ?? null,
      artistProfileImageUrl: video?.artistProfileImageUrl ?? null,
      artists: video?.artists ?? []
    });
  }

  const ownerMap = new Map(accessibleRows.map((row) => [row.id, row.owner_id]));
  const itemsByPlaylist = new Map<number, PlaylistItemResponse[]>();
  for (const row of accessibleRows) {
    itemsByPlaylist.set(row.id, []);
  }

  for (const item of playlistItems) {
    const bucket = itemsByPlaylist.get(item.playlist_id);
    if (!bucket) {
      continue;
    }
    const ownerId = ownerMap.get(item.playlist_id) ?? null;
    const isOwner = ownerId !== null && user?.id === ownerId;

    if (typeof item.video_id === "number") {
      const video = videoMap.get(item.video_id);
      if (!video) {
        continue;
      }
      if (!isOwner && video.hidden) {
        continue;
      }
      bucket.push({
        id: item.id,
        playlistId: item.playlist_id,
        ordering: Number(item.ordering),
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        type: "video",
        video
      });
      continue;
    }

    if (typeof item.clip_id === "number") {
      const clip = clipMap.get(item.clip_id);
      if (!clip) {
        continue;
      }
      const parentVideo = videoMap.get(clip.videoId);
      if (!isOwner && parentVideo?.hidden) {
        continue;
      }
      bucket.push({
        id: item.id,
        playlistId: item.playlist_id,
        ordering: Number(item.ordering),
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        type: "clip",
        clip
      });
    }
  }

  return accessibleRows.map((row) => ({
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    visibility: normalizePlaylistVisibility(row.visibility),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: itemsByPlaylist.get(row.id) ?? []
  }));
}

async function refreshArtistMetadataIfNeeded(env: Env, row: ArtistRow): Promise<ArtistRow> {
  const needsDisplayName = !row.display_name || row.display_name.trim().length === 0;
  const needsProfileImage = !row.profile_image_url || row.profile_image_url.trim().length === 0;
  const needsChannelTitle = !row.youtube_channel_title || row.youtube_channel_title.trim().length === 0;

  if (!needsDisplayName && !needsProfileImage && !needsChannelTitle) {
    return row;
  }

  const channelId = row.youtube_channel_id?.trim();
  if (!channelId) {
    return row;
  }

  const metadata = await testOverrides.fetchChannelMetadata(env, channelId);

  const assignments: string[] = [];
  const values: unknown[] = [];
  let displayName = row.display_name;
  let profileImageUrl = row.profile_image_url;
  let youtubeChannelId = row.youtube_channel_id;
  let youtubeChannelTitle = row.youtube_channel_title;

  if (metadata.channelId && metadata.channelId.trim() && metadata.channelId !== row.youtube_channel_id) {
    youtubeChannelId = metadata.channelId.trim();
    assignments.push("youtube_channel_id = ?");
    values.push(youtubeChannelId);
  }

  const normalizedTitle = metadata.title ? metadata.title.trim() : "";
  if ((needsDisplayName || needsChannelTitle) && normalizedTitle.length > 0) {
    if (needsDisplayName) {
      displayName = normalizedTitle;
      assignments.push("display_name = ?");
      values.push(normalizedTitle);
    }
    if (needsChannelTitle) {
      youtubeChannelTitle = normalizedTitle;
      assignments.push("youtube_channel_title = ?");
      values.push(normalizedTitle);
    }
  }

  if (needsProfileImage && metadata.profileImageUrl) {
    profileImageUrl = metadata.profileImageUrl;
    assignments.push("profile_image_url = ?");
    values.push(metadata.profileImageUrl);
  }

  if (assignments.length > 0) {
    assignments.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')");
    values.push(row.id);
    const sql = `UPDATE artists SET ${assignments.join(", ")} WHERE id = ?`;
    const result = await env.DB.prepare(sql).bind(...values).run();
    if (!result.success) {
      console.warn(
        `[yt-clip] Failed to update artist metadata for ${row.id}: ${result.error ?? "unknown error"}`
      );
    }
  }

  return {
    ...row,
    youtube_channel_id: youtubeChannelId ?? row.youtube_channel_id,
    display_name: displayName ?? row.display_name,
    youtube_channel_title: youtubeChannelTitle ?? row.youtube_channel_title,
    profile_image_url: profileImageUrl ?? row.profile_image_url
  };
}

function toArtistResponse(row: ArtistRow): ArtistResponse {
  return {
    id: row.id,
    name: row.name,
    displayName: row.display_name ?? row.name,
    youtubeChannelId: row.youtube_channel_id,
    youtubeChannelTitle: row.youtube_channel_title ?? null,
    profileImageUrl: row.profile_image_url ?? null,
    availableKo: toBooleanFlag(row.available_ko),
    availableEn: toBooleanFlag(row.available_en),
    availableJp: toBooleanFlag(row.available_jp),
    agency: row.agency ?? null,
    tags: row.tags ?? []
  };
}

function toVideoResponse(
  row: VideoRow,
  options: {
    artists?: VideoArtistResponse[];
    currentArtistId?: number | null;
    primaryArtist?: {
      name?: string | null;
      displayName?: string | null;
      youtubeChannelId?: string | null;
      youtubeChannelTitle?: string | null;
      profileImageUrl?: string | null;
    };
  } = {}
): VideoResponse {
  const artists = options.artists ?? [];
  const primaryArtistFromList = artists.find((artist) => artist.isPrimary) ?? null;
  const requestedArtist =
    (options.currentArtistId != null
      ? artists.find((artist) => artist.id === options.currentArtistId)
      : null) ?? primaryArtistFromList;

  const fallbackPrimaryId = primaryArtistFromList?.id ?? row.artist_id ?? null;
  const fallbackName = options.primaryArtist?.name ?? null;
  const fallbackDisplayName =
    options.primaryArtist?.displayName?.trim() || options.primaryArtist?.name || null;
  const fallbackChannelId = options.primaryArtist?.youtubeChannelId ?? null;
  const fallbackChannelTitle = options.primaryArtist?.youtubeChannelTitle ?? null;
  const fallbackProfileImageUrl = options.primaryArtist?.profileImageUrl ?? null;

  const resolvedArtistName = requestedArtist?.name ?? fallbackName ?? null;
  const resolvedArtistDisplayName =
    requestedArtist?.displayName ?? fallbackDisplayName ?? requestedArtist?.name ?? fallbackName ?? null;
  const resolvedChannelId = requestedArtist?.youtubeChannelId ?? fallbackChannelId ?? null;
  const resolvedChannelTitle = requestedArtist?.youtubeChannelTitle ?? fallbackChannelTitle ?? null;
  const resolvedProfileImage = requestedArtist?.profileImageUrl ?? fallbackProfileImageUrl ?? null;

  return {
    id: row.id,
    artistId: requestedArtist?.id ?? row.artist_id,
    primaryArtistId: fallbackPrimaryId,
    youtubeVideoId: row.youtube_video_id,
    title: row.title,
    durationSec: row.duration_sec ?? null,
    thumbnailUrl: row.thumbnail_url ?? null,
    channelId: row.channel_id ?? null,
    contentType: normalizeVideoContentType(row.content_type) ?? "OFFICIAL",
    category: normalizeVideoCategory(row.category),
    hidden: Number(row.hidden ?? 0) === 1,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
    originalComposer: row.original_composer ?? null,
    artistName: resolvedArtistName ?? undefined,
    artistDisplayName: resolvedArtistDisplayName ?? undefined,
    artistYoutubeChannelId: resolvedChannelId ?? undefined,
    artistYoutubeChannelTitle: resolvedChannelTitle ?? null,
    artistProfileImageUrl: resolvedProfileImage ?? null,
    artists
  };
}

function toVideoLibraryResponse(
  row: VideoLibraryRow,
  context: { artists?: VideoArtistResponse[]; currentArtistId?: number | null } = {}
): VideoResponse {
  return toVideoResponse(row, {
    artists: context.artists,
    currentArtistId: context.currentArtistId ?? row.requested_artist_id ?? null,
    primaryArtist: {
      name: row.artist_name ?? null,
      displayName: row.artist_display_name ?? null,
      youtubeChannelId: row.artist_youtube_channel_id ?? null,
      youtubeChannelTitle: row.artist_youtube_channel_title ?? null,
      profileImageUrl: row.artist_profile_image_url ?? null
    }
  });
}

async function hydrateVideoRow(env: Env, row: VideoRow): Promise<VideoResponse> {
  const hydrated = await env.DB.prepare(
    `SELECT
        v.id,
        v.artist_id,
        v.youtube_video_id,
        v.title,
        v.duration_sec,
        v.thumbnail_url,
        v.channel_id,
        v.description,
        v.captions_json,
        v.category,
        v.content_type,
        v.hidden,
        v.original_composer,
        v.created_at,
        v.updated_at,
        a.name AS artist_name,
        a.display_name AS artist_display_name,
        a.youtube_channel_id AS artist_youtube_channel_id,
        a.youtube_channel_title AS artist_youtube_channel_title,
        a.profile_image_url AS artist_profile_image_url
      FROM videos v
      LEFT JOIN artists a ON a.id = v.artist_id
     WHERE v.id = ?`
  )
    .bind(row.id)
    .first<VideoLibraryRow>();

  const artistMap = await fetchVideoArtistMap(env, [row.id]);
  const artists = artistMap.get(row.id) ?? [];

  if (!hydrated) {
    return toVideoResponse(row, { artists });
  }

  return toVideoLibraryResponse(hydrated, { artists });
}

interface AttachTagsOptions {
  includeVideoMeta?: boolean;
}

async function attachTags(
  env: Env,
  rows: ClipRow[] | undefined,
  options: AttachTagsOptions = {}
): Promise<ClipResponse[]> {
  const clips = rows ?? [];
  if (clips.length === 0) {
    return [];
  }
  const clipIds = clips.map((clip) => clip.id);
  const placeholders = clipIds.map(() => "?").join(", ");
  const { results } = await env.DB.prepare(
    `SELECT clip_id, tag FROM clip_tags WHERE clip_id IN (${placeholders}) ORDER BY tag`
  ).bind(...clipIds).all<{ clip_id: number; tag: string }>();
  const tagsMap = new Map<number, string[]>();
  for (const entry of results ?? []) {
    if (!tagsMap.has(entry.clip_id)) {
      tagsMap.set(entry.clip_id, []);
    }
    tagsMap.get(entry.clip_id)!.push(entry.tag);
  }

  let videoMeta: Map<number, VideoResponse> | null = null;
  if (options.includeVideoMeta) {
    const videoIds = Array.from(new Set(clips.map((clip) => clip.video_id)));
    if (videoIds.length > 0) {
      videoMeta = await loadVideoResponseMap(env, videoIds);
    }
  }

  return clips.map((clip) => {
    const meta = videoMeta?.get(clip.video_id) ?? null;
    return {
      id: clip.id,
      videoId: clip.video_id,
      title: clip.title,
      startSec: Number(clip.start_sec),
      endSec: Number(clip.end_sec),
      tags: tagsMap.get(clip.id) ?? [],
      originalComposer: clip.original_composer ?? null,
      youtubeVideoId: meta?.youtubeVideoId ?? undefined,
      videoTitle: meta?.title ?? null,
      videoOriginalComposer: meta?.originalComposer ?? null,
      createdAt: clip.created_at ?? null,
      updatedAt: clip.updated_at ?? null,
      artistId: meta?.artistId ?? undefined,
      primaryArtistId: meta?.primaryArtistId ?? null,
      artistName: meta?.artistName ?? undefined,
      artistDisplayName: meta?.artistDisplayName ?? undefined,
      artistYoutubeChannelId: meta?.artistYoutubeChannelId ?? undefined,
      artistYoutubeChannelTitle: meta?.artistYoutubeChannelTitle ?? null,
      artistProfileImageUrl: meta?.artistProfileImageUrl ?? null,
      artists: meta?.artists ?? []
    } satisfies ClipResponse;
  });
}

function extractVideoId(url: string): string | null {
  if (!url) {
    return null;
  }
  const pattern = /[?&]v=([a-zA-Z0-9_-]{11})/;
  const match = url.match(pattern);
  if (match) {
    return match[1];
  }
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const last = segments[segments.length - 1];
    if (last && last.length === 11) {
      return last;
    }
  } catch {
    // ignore
  }
  return null;
}

interface YouTubeThumbnailDetails {
  url?: string;
  width?: number;
  height?: number;
}

interface YouTubeThumbnails {
  default?: YouTubeThumbnailDetails;
  medium?: YouTubeThumbnailDetails;
  high?: YouTubeThumbnailDetails;
  standard?: YouTubeThumbnailDetails;
  maxres?: YouTubeThumbnailDetails;
  [key: string]: YouTubeThumbnailDetails | undefined;
}

interface YouTubeSnippet {
  title?: string;
  channelId?: string;
  thumbnails?: YouTubeThumbnails;
  publishedAt?: string;
  description?: string;
}

interface YouTubeContentDetails {
  duration?: string;
}

interface YouTubeVideoItem {
  snippet?: YouTubeSnippet;
  contentDetails?: YouTubeContentDetails;
}

interface YouTubeVideosResponse {
  items?: YouTubeVideoItem[];
}

interface YouTubeChapterNode {
  title?: string;
  startTime?: unknown;
  endTime?: unknown;
}

interface YouTubeVideoItemWithChapters extends YouTubeVideoItem {
  chapters?: {
    chapters?: YouTubeChapterNode[];
  };
}

interface YouTubeChannelItem {
  id?: string;
  snippet?: YouTubeSnippet;
}

interface YouTubeChannelsResponse {
  items?: YouTubeChannelItem[];
}

interface YouTubeSearchId {
  channelId?: string;
  videoId?: string;
}

interface YouTubeSearchItem {
  id?: YouTubeSearchId;
  snippet?: YouTubeSnippet;
}

interface YouTubeSearchResponse {
  items?: YouTubeSearchItem[];
}

interface YouTubeCommentSnippet {
  textOriginal?: string;
  textDisplay?: string;
  authorDisplayName?: string;
  likeCount?: number;
  publishedAt?: string;
  updatedAt?: string;
}

interface YouTubeComment {
  id?: string;
  snippet?: YouTubeCommentSnippet;
}

interface YouTubeCommentThreadSnippet {
  topLevelComment?: YouTubeComment;
}

interface YouTubeCommentThreadItem {
  id?: string;
  snippet?: YouTubeCommentThreadSnippet;
}

interface YouTubeCommentThreadsResponse {
  items?: YouTubeCommentThreadItem[];
  nextPageToken?: string;
}

const ISO_8601_DURATION_PATTERN = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i;

function parseIso8601Duration(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const match = value.match(ISO_8601_DURATION_PATTERN);
  if (!match) {
    return null;
  }
  const days = match[1] ? Number(match[1]) : 0;
  const hours = match[2] ? Number(match[2]) : 0;
  const minutes = match[3] ? Number(match[3]) : 0;
  const seconds = match[4] ? Number(match[4]) : 0;
  if ([days, hours, minutes, seconds].some((part) => !Number.isFinite(part))) {
    return null;
  }
  return days * 86400 + hours * 3600 + minutes * 60 + seconds;
}

function selectThumbnailUrl(thumbnails: YouTubeThumbnails | undefined): string | null {
  if (!thumbnails || typeof thumbnails !== "object") {
    return null;
  }
  const preferredOrder = ["maxres", "standard", "high", "medium", "default"];
  for (const key of preferredOrder) {
    const url = thumbnails[key]?.url;
    if (typeof url === "string" && url.trim().length > 0) {
      return url.trim();
    }
  }
  for (const details of Object.values(thumbnails)) {
    const url = details?.url;
    if (typeof url === "string" && url.trim().length > 0) {
      return url.trim();
    }
  }
  return null;
}

function sanitizeMultilineText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.replace(/\r\n?/g, "\n");
  const trimmed = normalized.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeOptionalText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return trimmed.slice(0, 255);
}

async function fetchVideoMetadata(env: Env, videoId: string): Promise<{
  title: string;
  durationSec: number | null;
  thumbnailUrl: string | null;
  channelId: string | null;
  description: string | null;
}> {
  const fallback = {
    title: `Video ${videoId}`,
    durationSec: null,
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    channelId: null,
    description: null
  };

  const apiKey = env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) {
    warnMissingYouTubeApiKey();
    return fallback;
  }

  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("id", videoId);
  url.searchParams.set("part", "snippet,contentDetails");
  url.searchParams.set("key", apiKey);

  let response: Response;
  try {
    response = await fetch(url.toString(), { method: "GET" });
  } catch (error) {
    console.error(`[yt-clip] Failed to contact YouTube Data API for video ${videoId}`, error);
    return fallback;
  }

  if (!response.ok) {
    console.warn(`[yt-clip] YouTube Data API responded with status ${response.status} for video ${videoId}`);
    return fallback;
  }

  let payload: YouTubeVideosResponse;
  try {
    payload = (await response.json()) as YouTubeVideosResponse;
  } catch (error) {
    console.error("[yt-clip] Failed to parse YouTube Data API response", error);
    return fallback;
  }

  const item = Array.isArray(payload.items) ? payload.items[0] ?? null : null;
  if (!item) {
    console.warn(`[yt-clip] YouTube Data API returned no items for video ${videoId}`);
    return fallback;
  }

  const snippet = item.snippet;
  const contentDetails = item.contentDetails;

  const title = typeof snippet?.title === "string" && snippet.title.trim().length > 0 ? snippet.title.trim() : fallback.title;
  const channelId =
    typeof snippet?.channelId === "string" && snippet.channelId.trim().length > 0 ? snippet.channelId.trim() : null;
  const thumbnailUrl = selectThumbnailUrl(snippet?.thumbnails) ?? fallback.thumbnailUrl;
  const durationSec = parseIso8601Duration(contentDetails?.duration) ?? fallback.durationSec;

  const description = sanitizeMultilineText(snippet?.description);

  return {
    title,
    durationSec,
    thumbnailUrl,
    channelId,
    description
  };
}

async function fetchVideoSectionsFromApi(
  env: Env,
  videoId: string,
  durationSec: number | null
): Promise<VideoSectionResponse[]> {
  const apiKey = env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) {
    warnMissingYouTubeApiKey();
    return [];
  }

  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "chapters");
  url.searchParams.set("id", videoId);
  url.searchParams.set("key", apiKey);

  let response: Response;
  try {
    response = await fetch(url.toString(), { method: "GET" });
  } catch (error) {
    console.warn(`[yt-clip] Failed to fetch YouTube chapters for ${videoId}`, error);
    return [];
  }

  if (!response.ok) {
    console.warn(`[yt-clip] YouTube chapters API responded with status ${response.status} for video ${videoId}`);
    return [];
  }

  let payload: YouTubeVideosResponse;
  try {
    payload = (await response.json()) as YouTubeVideosResponse;
  } catch (error) {
    console.warn(`[yt-clip] Failed to parse YouTube chapters response for ${videoId}`, error);
    return [];
  }

  const item = Array.isArray(payload.items) ? (payload.items[0] as YouTubeVideoItemWithChapters | undefined) : undefined;
  const chapters = item?.chapters?.chapters;
  if (!Array.isArray(chapters) || chapters.length === 0) {
    return [];
  }

  const sections: VideoSectionResponse[] = [];
  for (const chapter of chapters) {
    if (!chapter) {
      continue;
    }
    const start = parseChapterBoundary(chapter.startTime);
    if (start < 0) {
      continue;
    }
    let end = parseChapterBoundary(chapter.endTime);
    if (end <= start) {
      end = start + DEFAULT_SECTION_LENGTH;
    }
    if (durationSec != null) {
      end = Math.min(end, durationSec);
    }
    end = Math.max(end, start + 5);

    const title = normalizeSectionLabel(typeof chapter.title === "string" ? chapter.title : "");
    sections.push({ title, startSec: start, endSec: end, source: "YOUTUBE_CHAPTER" });
  }

  return sections;
}

async function fetchVideoSectionsFromComments(
  env: Env,
  videoId: string,
  durationSec: number | null
): Promise<VideoSectionResponse[]> {
  const apiKey = env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) {
    warnMissingYouTubeApiKey();
    return [];
  }

  const MAX_RESULTS_PER_PAGE = 100;
  const MAX_COMMENT_PAGES = 5;

  let pageToken: string | undefined;

  for (let page = 0; page < MAX_COMMENT_PAGES; page += 1) {
    const url = new URL("https://www.googleapis.com/youtube/v3/commentThreads");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("videoId", videoId);
    url.searchParams.set("maxResults", String(MAX_RESULTS_PER_PAGE));
    url.searchParams.set("order", "relevance");
    url.searchParams.set("textFormat", "plainText");
    url.searchParams.set("key", apiKey);
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    let response: Response;
    try {
      response = await fetch(url.toString(), { method: "GET" });
    } catch (error) {
      console.warn(`[yt-clip] Failed to fetch YouTube comments for ${videoId}`, error);
      return [];
    }

    if (!response.ok) {
      console.warn(`[yt-clip] YouTube comments API responded with status ${response.status} for video ${videoId}`);
      return [];
    }

    let payload: YouTubeCommentThreadsResponse;
    try {
      payload = (await response.json()) as YouTubeCommentThreadsResponse;
    } catch (error) {
      console.warn(`[yt-clip] Failed to parse YouTube comments response for ${videoId}`, error);
      return [];
    }

    const items = Array.isArray(payload.items) ? payload.items : [];
    for (const item of items) {
      const snippet = item?.snippet?.topLevelComment?.snippet;
      const text = normalizeCommentText(snippet);
      if (!text) {
        continue;
      }
      const sections = extractSectionsFromText(text, durationSec, "COMMENT");
      if (sections.length >= 2) {
        return sections;
      }
    }

    const nextToken = typeof payload.nextPageToken === "string" ? payload.nextPageToken.trim() : "";
    if (!nextToken) {
      break;
    }
    pageToken = nextToken;
  }

  return [];
}

function extractSectionsFromText(
  text: string,
  durationSec: number | null,
  source: VideoSectionSource
): VideoSectionResponse[] {
  if (!text || !text.trim()) {
    return [];
  }

  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const candidates: { start: number; label: string }[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    const match = line.match(TIMESTAMP_PATTERN);
    if (!match) {
      continue;
    }
    const hours = match[1] ? Number(match[1]) : 0;
    const minutes = Number(match[2]);
    const seconds = Number(match[3]);
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) {
      continue;
    }
    const start = hours * 3600 + minutes * 60 + seconds;
    if (start < 0) {
      continue;
    }
    const label = normalizeSectionLabel(match[4] ?? "");
    candidates.push({ start, label });
  }

  if (candidates.length < 2) {
    return [];
  }

  candidates.sort((a, b) => a.start - b.start);
  const sections: VideoSectionResponse[] = [];

  for (let i = 0; i < candidates.length; i += 1) {
    const current = candidates[i];
    const next = candidates[i + 1];
    let end = next ? next.start : current.start + DEFAULT_SECTION_LENGTH;
    if (durationSec != null) {
      end = Math.min(end, durationSec);
    }
    end = Math.max(end, current.start + 5);
    sections.push({ title: current.label, startSec: current.start, endSec: end, source });
  }

  return sections;
}

function normalizeSectionLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) {
    return "Track";
  }
  if (trimmed.length > 120) {
    return trimmed.slice(0, 120);
  }
  return trimmed;
}

function normalizeCommentText(snippet: YouTubeCommentSnippet | undefined): string {
  if (!snippet) {
    return "";
  }
  if (typeof snippet.textOriginal === "string" && snippet.textOriginal.trim()) {
    return snippet.textOriginal.trim();
  }
  if (typeof snippet.textDisplay === "string" && snippet.textDisplay.trim()) {
    return snippet.textDisplay.trim();
  }
  return "";
}

function parseChapterBoundary(node: unknown): number {
  const parseSecondsValue = (value: unknown): number => {
    if (value == null) {
      return -1;
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value) || value < 0) {
        return -1;
      }
      return Math.floor(value);
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) {
        return -1;
      }
      const colonMatch = trimmed.match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/);
      if (colonMatch) {
        const hours = colonMatch[1] ? Number(colonMatch[1]) : 0;
        const minutes = Number(colonMatch[2]);
        const seconds = Number(colonMatch[3]);
        if ([hours, minutes, seconds].every((part) => Number.isFinite(part) && part >= 0)) {
          return hours * 3600 + minutes * 60 + seconds;
        }
      }
      if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
        const numeric = Number.parseFloat(trimmed);
        if (Number.isFinite(numeric) && numeric >= 0) {
          return Math.floor(numeric);
        }
      }
      const iso = parseIso8601Duration(trimmed);
      if (iso != null && iso >= 0) {
        return iso;
      }
      return -1;
    }
    return -1;
  };

  const parseMillisecondsValue = (value: unknown): number => {
    if (value == null) {
      return -1;
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value) || value < 0) {
        return -1;
      }
      return Math.floor(value / 1000);
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) {
        return -1;
      }
      if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
        const numeric = Number.parseFloat(trimmed);
        if (Number.isFinite(numeric) && numeric >= 0) {
          return Math.floor(numeric / 1000);
        }
      }
    }
    return -1;
  };

  let candidate = parseSecondsValue(node);
  if (candidate >= 0) {
    return candidate;
  }

  candidate = parseMillisecondsValue(node);
  if (candidate >= 0) {
    return candidate;
  }

  if (node && typeof node === "object") {
    const value = node as Record<string, unknown>;
    const secondKeys = ["seconds", "sec", "value", "start", "startSeconds", "startTime"] as const;
    for (const key of secondKeys) {
      candidate = parseSecondsValue(value[key]);
      if (candidate >= 0) {
        return candidate;
      }
    }
    const millisecondKeys = ["milliseconds", "ms", "startMs", "startMilliseconds"] as const;
    for (const key of millisecondKeys) {
      candidate = parseMillisecondsValue(value[key]);
      if (candidate >= 0) {
        return candidate;
      }
    }
    const isoKeys = ["text", "displayText", "startTimeText"] as const;
    for (const key of isoKeys) {
      const raw = value[key];
      if (typeof raw === "string") {
        const iso = parseIso8601Duration(raw.trim());
        if (iso != null && iso >= 0) {
          return iso;
        }
      }
    }
  }

  return -1;
}

const YOUTUBE_CHANNEL_ID_PATTERN = /^UC[0-9A-Za-z_-]{22}$/;
const YOUTUBE_HOST_SUFFIXES = ["youtube.com", "youtu.be"];

function tryParseYouTubeUrl(value: string): URL | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return new URL(trimmed);
  } catch {
    try {
      return new URL(`https://${trimmed}`);
    } catch {
      return null;
    }
  }
}

function isYouTubeHost(host: string): boolean {
  const lower = host.toLowerCase();
  return YOUTUBE_HOST_SUFFIXES.some((suffix) => lower === suffix || lower.endsWith(`.${suffix}`));
}

function parseYouTubeChannelIdentifier(value: string): {
  channelId: string | null;
  username: string | null;
  handle: string | null;
} {
  const trimmed = value.trim();
  if (!trimmed) {
    return { channelId: null, username: null, handle: null };
  }

  if (YOUTUBE_CHANNEL_ID_PATTERN.test(trimmed)) {
    return { channelId: trimmed, username: null, handle: null };
  }

  if (trimmed.startsWith("@")) {
    return { channelId: null, username: null, handle: trimmed.slice(1) };
  }

  const parsedUrl = tryParseYouTubeUrl(trimmed);
  if (!parsedUrl || !isYouTubeHost(parsedUrl.host)) {
    return { channelId: null, username: null, handle: null };
  }

  const segments = parsedUrl.pathname
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    return { channelId: null, username: null, handle: null };
  }

  const [first, second] = segments;
  if (first.startsWith("@")) {
    return { channelId: null, username: null, handle: first.slice(1) };
  }

  if (first === "channel" && second) {
    const candidate = second.trim();
    if (YOUTUBE_CHANNEL_ID_PATTERN.test(candidate)) {
      return { channelId: candidate, username: null, handle: null };
    }
    return { channelId: null, username: null, handle: null };
  }

  if ((first === "user" || first === "c") && second) {
    return { channelId: null, username: second.trim(), handle: null };
  }

  if (segments.length === 1) {
    const single = segments[0];
    if (single.startsWith("@")) {
      return { channelId: null, username: null, handle: single.slice(1) };
    }
    return { channelId: null, username: single.trim(), handle: null };
  }

  return { channelId: null, username: null, handle: null };
}

type HtmlChannelMetadata = {
  title: string | null;
  thumbnailUrl: string | null;
  channelId: string | null;
};

const CHANNEL_UPLOAD_KEYWORDS = ["cover", "original", "official"] as const;

type ChannelUploadVideo = {
  videoId: string;
  title: string | null;
  url: string;
  thumbnailUrl: string | null;
  publishedAt: string | null;
};

async function fetchChannelMetadata(env: Env, channelId: string): Promise<ChannelMetadata> {
  const trimmedChannelId = channelId.trim();
  const baseDebug: ChannelMetadataDebug = {
    input: trimmedChannelId,
    identifier: { channelId: null, username: null, handle: null },
    htmlCandidates: [],
    attemptedHtml: false,
    attemptedApi: false,
    apiStatus: null,
    usedHtmlFallback: false,
    usedApi: false,
    htmlChannelId: null,
    htmlTitle: null,
    htmlThumbnail: null,
    resolvedChannelId: null,
    warnings: [],
    videoFetchAttempted: false,
    videoFetchStatus: null,
    videoFilterKeywords: [],
    filteredVideoCount: 0,
    videoFetchError: null
  };

  if (!trimmedChannelId) {
    return { title: null, profileImageUrl: null, channelId: null, debug: baseDebug };
  }

  const identifier = parseYouTubeChannelIdentifier(trimmedChannelId);
  baseDebug.identifier = identifier;

  let effectiveChannelId = identifier.channelId;
  const htmlCandidates = buildChannelUrlCandidates(identifier, trimmedChannelId);
  baseDebug.htmlCandidates = htmlCandidates;

  let htmlMetadataCache: HtmlChannelMetadata | null | undefined;
  const loadHtmlMetadata = async (): Promise<HtmlChannelMetadata | null> => {
    if (typeof htmlMetadataCache === "undefined") {
      baseDebug.attemptedHtml = true;
      htmlMetadataCache = await fetchChannelMetadataFromHtml(htmlCandidates);
      if (htmlMetadataCache) {
        baseDebug.htmlChannelId = htmlMetadataCache.channelId ?? null;
        baseDebug.htmlTitle = htmlMetadataCache.title ?? null;
        baseDebug.htmlThumbnail = htmlMetadataCache.thumbnailUrl ?? null;
      }
    }
    return htmlMetadataCache ?? null;
  };

  if (!effectiveChannelId && identifier.handle) {
    const htmlMetadata = await loadHtmlMetadata();
    if (htmlMetadata?.channelId) {
      effectiveChannelId = htmlMetadata.channelId;
    }
  }

  const apiKey = env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) {
    warnMissingYouTubeApiKey();
    baseDebug.warnings.push("YOUTUBE_API_KEY missing");
    const htmlMetadata = await loadHtmlMetadata();
    if (htmlMetadata) {
      const resolvedChannelId = htmlMetadata.channelId ?? identifier.channelId ?? null;
      baseDebug.usedHtmlFallback = true;
      baseDebug.resolvedChannelId = resolvedChannelId;
      return {
        title: htmlMetadata.title,
        profileImageUrl: htmlMetadata.thumbnailUrl,
        channelId: resolvedChannelId,
        debug: baseDebug
      };
    }
    const resolvedChannelId = identifier.channelId ?? null;
    baseDebug.resolvedChannelId = resolvedChannelId;
    return { title: null, profileImageUrl: null, channelId: resolvedChannelId, debug: baseDebug };
  }

  let searchSnippet: YouTubeSnippet | null = null;
  if (!effectiveChannelId && identifier.handle) {
    const searchResult = await searchChannelByHandle(apiKey, identifier.handle);
    if (searchResult) {
      effectiveChannelId = searchResult.channelId ?? effectiveChannelId;
      if (searchResult.snippet) {
        searchSnippet = searchResult.snippet;
      }
      if (searchResult.channelId && !identifier.channelId) {
        baseDebug.warnings.push(`Resolved channel ID via search API: ${searchResult.channelId}`);
      }
    }
  }

  const hasApiIdentifier = Boolean(effectiveChannelId || identifier.username || identifier.channelId);
  if (!hasApiIdentifier) {
    const htmlMetadata = await loadHtmlMetadata();
    if (htmlMetadata) {
      const resolvedChannelId = htmlMetadata.channelId ?? identifier.channelId ?? null;
      baseDebug.usedHtmlFallback = true;
      baseDebug.resolvedChannelId = resolvedChannelId;
      return {
        title: htmlMetadata.title,
        profileImageUrl: htmlMetadata.thumbnailUrl,
        channelId: resolvedChannelId,
        debug: baseDebug
      };
    }
    if (searchSnippet) {
      const resolvedChannelId = identifier.channelId ?? null;
      baseDebug.resolvedChannelId = resolvedChannelId;
      return {
        title: sanitizeSnippetTitle(searchSnippet),
        profileImageUrl: selectThumbnailUrl(searchSnippet.thumbnails) ?? null,
        channelId: resolvedChannelId,
        debug: baseDebug
      };
    }
    baseDebug.resolvedChannelId = identifier.channelId ?? null;
    return { title: null, profileImageUrl: null, channelId: identifier.channelId ?? null, debug: baseDebug };
  }

  const url = new URL("https://www.googleapis.com/youtube/v3/channels");
  if (effectiveChannelId) {
    url.searchParams.set("id", effectiveChannelId);
  } else if (identifier.username) {
    url.searchParams.set("forUsername", identifier.username);
  } else if (identifier.channelId) {
    url.searchParams.set("id", identifier.channelId);
  }
  url.searchParams.set("part", "snippet");
  url.searchParams.set("key", apiKey);

  let response: Response;
  try {
    response = await fetch(url.toString(), { method: "GET" });
    baseDebug.attemptedApi = true;
    baseDebug.apiStatus = response.status;
  } catch (error) {
    baseDebug.attemptedApi = true;
    baseDebug.apiStatus = null;
    console.error(`[yt-clip] Failed to contact YouTube Data API for channel ${trimmedChannelId}`, error);
    const htmlMetadata = await loadHtmlMetadata();
    if (htmlMetadata) {
      const resolvedChannelId = htmlMetadata.channelId ?? effectiveChannelId ?? identifier.channelId ?? null;
      baseDebug.usedHtmlFallback = true;
      baseDebug.resolvedChannelId = resolvedChannelId;
      return {
        title: htmlMetadata.title,
        profileImageUrl: htmlMetadata.thumbnailUrl,
        channelId: resolvedChannelId,
        debug: baseDebug
      };
    }
    if (searchSnippet) {
      const resolvedChannelId = effectiveChannelId ?? identifier.channelId ?? null;
      baseDebug.resolvedChannelId = resolvedChannelId;
      return {
        title: sanitizeSnippetTitle(searchSnippet),
        profileImageUrl: selectThumbnailUrl(searchSnippet.thumbnails) ?? null,
        channelId: resolvedChannelId,
        debug: baseDebug
      };
    }
    const resolvedChannelId = effectiveChannelId ?? identifier.channelId ?? null;
    baseDebug.resolvedChannelId = resolvedChannelId;
    return { title: null, profileImageUrl: null, channelId: resolvedChannelId, debug: baseDebug };
  }

  if (!response.ok) {
    console.warn(`[yt-clip] YouTube Data API responded with status ${response.status} for channel ${trimmedChannelId}`);
    const htmlMetadata = await loadHtmlMetadata();
    if (htmlMetadata) {
      const resolvedChannelId = htmlMetadata.channelId ?? effectiveChannelId ?? identifier.channelId ?? null;
      baseDebug.usedHtmlFallback = true;
      baseDebug.resolvedChannelId = resolvedChannelId;
      return {
        title: htmlMetadata.title,
        profileImageUrl: htmlMetadata.thumbnailUrl,
        channelId: resolvedChannelId,
        debug: baseDebug
      };
    }
    if (searchSnippet) {
      const resolvedChannelId = effectiveChannelId ?? identifier.channelId ?? null;
      baseDebug.resolvedChannelId = resolvedChannelId;
      return {
        title: sanitizeSnippetTitle(searchSnippet),
        profileImageUrl: selectThumbnailUrl(searchSnippet.thumbnails) ?? null,
        channelId: resolvedChannelId,
        debug: baseDebug
      };
    }
    const resolvedChannelId = effectiveChannelId ?? identifier.channelId ?? null;
    baseDebug.resolvedChannelId = resolvedChannelId;
    return { title: null, profileImageUrl: null, channelId: resolvedChannelId, debug: baseDebug };
  }

  let payload: YouTubeChannelsResponse;
  try {
    payload = (await response.json()) as YouTubeChannelsResponse;
  } catch (error) {
    console.error("[yt-clip] Failed to parse YouTube Data API channel response", error);
    const htmlMetadata = await loadHtmlMetadata();
    if (htmlMetadata) {
      const resolvedChannelId = htmlMetadata.channelId ?? effectiveChannelId ?? identifier.channelId ?? null;
      baseDebug.usedHtmlFallback = true;
      baseDebug.resolvedChannelId = resolvedChannelId;
      return {
        title: htmlMetadata.title,
        profileImageUrl: htmlMetadata.thumbnailUrl,
        channelId: resolvedChannelId,
        debug: baseDebug
      };
    }
    if (searchSnippet) {
      const resolvedChannelId = effectiveChannelId ?? identifier.channelId ?? null;
      baseDebug.resolvedChannelId = resolvedChannelId;
      return {
        title: sanitizeSnippetTitle(searchSnippet),
        profileImageUrl: selectThumbnailUrl(searchSnippet.thumbnails) ?? null,
        channelId: resolvedChannelId,
        debug: baseDebug
      };
    }
    const resolvedChannelId = effectiveChannelId ?? identifier.channelId ?? null;
    baseDebug.resolvedChannelId = resolvedChannelId;
    return { title: null, profileImageUrl: null, channelId: resolvedChannelId, debug: baseDebug };
  }

  const item = Array.isArray(payload.items) ? payload.items[0] ?? null : null;
  if (!item) {
    const htmlMetadata = await loadHtmlMetadata();
    if (htmlMetadata) {
      const resolvedChannelId = htmlMetadata.channelId ?? effectiveChannelId ?? identifier.channelId ?? null;
      baseDebug.usedHtmlFallback = true;
      baseDebug.resolvedChannelId = resolvedChannelId;
      return {
        title: htmlMetadata.title,
        profileImageUrl: htmlMetadata.thumbnailUrl,
        channelId: resolvedChannelId,
        debug: baseDebug
      };
    }
    if (searchSnippet) {
      const resolvedChannelId = effectiveChannelId ?? identifier.channelId ?? null;
      baseDebug.resolvedChannelId = resolvedChannelId;
      return {
        title: sanitizeSnippetTitle(searchSnippet),
        profileImageUrl: selectThumbnailUrl(searchSnippet.thumbnails) ?? null,
        channelId: resolvedChannelId,
        debug: baseDebug
      };
    }
    const resolvedChannelId = effectiveChannelId ?? identifier.channelId ?? null;
    baseDebug.resolvedChannelId = resolvedChannelId;
    return { title: null, profileImageUrl: null, channelId: resolvedChannelId, debug: baseDebug };
  }

  const snippet = item.snippet;
  const htmlMetadata = await loadHtmlMetadata();

  let title = typeof snippet?.title === "string" && snippet.title.trim().length > 0 ? snippet.title.trim() : null;
  if (!title) {
    title = sanitizeSnippetTitle(searchSnippet) ?? htmlMetadata?.title ?? null;
    if (title) {
      baseDebug.usedHtmlFallback = true;
    }
  }

  let profileImageUrl = selectThumbnailUrl(snippet?.thumbnails) ?? null;
  if (!profileImageUrl) {
    profileImageUrl = selectThumbnailUrl(searchSnippet?.thumbnails) ?? htmlMetadata?.thumbnailUrl ?? null;
    if (profileImageUrl) {
      baseDebug.usedHtmlFallback = true;
    }
  }

  const resolvedChannelId =
    typeof item?.id === "string" && item.id.trim()
      ? item.id.trim()
      : effectiveChannelId ?? htmlMetadata?.channelId ?? identifier.channelId ?? searchSnippet?.channelId ?? null;

  baseDebug.usedApi = true;
  baseDebug.resolvedChannelId = resolvedChannelId;

  return { title, profileImageUrl, channelId: resolvedChannelId, debug: baseDebug };
}

async function fetchFilteredChannelUploads(
  env: Env,
  channelId: string | null,
  debug: ChannelMetadataDebug
): Promise<ChannelUploadVideo[]> {
  const trimmedChannelId = typeof channelId === "string" ? channelId.trim() : "";
  debug.videoFilterKeywords = Array.from(CHANNEL_UPLOAD_KEYWORDS);
  if (!trimmedChannelId) {
    debug.videoFetchError = "channelId missing";
    return [];
  }

  const apiKey = env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) {
    const warning = "YOUTUBE_API_KEY missing";
    debug.videoFetchError = warning;
    if (!debug.warnings.includes(warning)) {
      debug.warnings.push(warning);
    }
    return [];
  }

  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("channelId", trimmedChannelId);
  url.searchParams.set("type", "video");
  url.searchParams.set("order", "date");
  url.searchParams.set("maxResults", "50");
  url.searchParams.set("key", apiKey);

  debug.videoFetchAttempted = true;

  let response: Response;
  try {
    response = await fetch(url.toString(), { method: "GET" });
  } catch (error) {
    debug.videoFetchError = error instanceof Error ? error.message : "Failed to fetch channel uploads";
    console.warn(`[yt-clip] Failed to contact YouTube Data API for uploads of channel ${trimmedChannelId}`, error);
    return [];
  }

  debug.videoFetchStatus = response.status;

  if (!response.ok) {
    debug.videoFetchError = `HTTP ${response.status}`;
    console.warn(
      `[yt-clip] YouTube Data API responded with status ${response.status} when listing uploads for channel ${trimmedChannelId}`
    );
    return [];
  }

  let payload: YouTubeSearchResponse;
  try {
    payload = (await response.json()) as YouTubeSearchResponse;
  } catch (error) {
    debug.videoFetchError = "Invalid JSON response";
    console.error("[yt-clip] Failed to parse YouTube channel uploads response", error);
    return [];
  }

  const items = Array.isArray(payload.items) ? payload.items : [];
  const seen = new Set<string>();
  const filtered: ChannelUploadVideo[] = [];

  for (const item of items) {
    const rawVideoId = item?.id?.videoId;
    const videoId = typeof rawVideoId === "string" ? rawVideoId.trim() : "";
    if (!videoId || seen.has(videoId)) {
      continue;
    }

    const snippet = item?.snippet;
    const title = sanitizeSnippetTitle(snippet ?? null);
    const comparisonTitle = (title ?? snippet?.title ?? "").toLowerCase();
    if (!CHANNEL_UPLOAD_KEYWORDS.some((keyword) => comparisonTitle.includes(keyword))) {
      continue;
    }

    seen.add(videoId);
    const publishedAtRaw = typeof snippet?.publishedAt === "string" ? snippet.publishedAt.trim() : "";
    let publishedAt: string | null = null;
    if (publishedAtRaw) {
      const date = new Date(publishedAtRaw);
      if (!Number.isNaN(date.getTime())) {
        publishedAt = date.toISOString();
      }
    }

    filtered.push({
      videoId,
      title,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      thumbnailUrl: selectThumbnailUrl(snippet?.thumbnails) ?? null,
      publishedAt
    });
  }

  filtered.sort((a, b) => {
    if (a.publishedAt && b.publishedAt) {
      return b.publishedAt.localeCompare(a.publishedAt);
    }
    if (a.publishedAt) {
      return -1;
    }
    if (b.publishedAt) {
      return 1;
    }
    return 0;
  });

  debug.filteredVideoCount = filtered.length;
  debug.videoFetchError = null;

  return filtered;
}

function sanitizeSnippetTitle(snippet: YouTubeSnippet | null): string | null {
  if (!snippet?.title) {
    return null;
  }
  const trimmed = snippet.title.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function searchChannelByHandle(
  apiKey: string,
  handle: string
): Promise<{ channelId: string | null; snippet: YouTubeSnippet | null } | null> {
  const normalizedHandle = handle.startsWith("@") ? handle : `@${handle}`;
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "channel");
  url.searchParams.set("maxResults", "1");
  url.searchParams.set("q", normalizedHandle);
  url.searchParams.set("key", apiKey);

  try {
    const response = await fetch(url.toString(), { method: "GET" });
    if (!response.ok) {
      console.warn(`[yt-clip] YouTube Data API search failed with status ${response.status} for handle ${handle}`);
      return null;
    }
    const payload = (await response.json()) as YouTubeSearchResponse;
    const item = Array.isArray(payload.items) ? payload.items.find((candidate) => !!candidate) ?? null : null;
    if (!item) {
      return null;
    }
    const resolvedChannelId = item.id?.channelId?.trim() ?? null;
    const snippet = item.snippet ?? null;
    if (!resolvedChannelId && !snippet) {
      return null;
    }
    return { channelId: resolvedChannelId, snippet };
  } catch (error) {
    console.warn(`[yt-clip] Failed to resolve channel handle ${handle} via search API`, error);
    return null;
  }
}

function buildChannelUrlCandidates(
  identifier: ReturnType<typeof parseYouTubeChannelIdentifier>,
  originalInput: string
): string[] {
  const candidates = new Set<string>();
  const trimmed = originalInput.trim();

  const parsed = tryParseYouTubeUrl(trimmed);
  if (parsed) {
    const normalizedPath = parsed.pathname.replace(/\/+$/, "");
    candidates.add(`${parsed.origin}${normalizedPath}`);
  } else if (trimmed) {
    candidates.add(`https://www.youtube.com/${trimmed.replace(/^\/+/, "")}`);
  }

  if (identifier.handle) {
    candidates.add(`https://www.youtube.com/@${identifier.handle}`);
  }

  if (identifier.channelId) {
    candidates.add(`https://www.youtube.com/channel/${identifier.channelId}`);
  }

  if (identifier.username) {
    candidates.add(`https://www.youtube.com/user/${identifier.username}`);
    candidates.add(`https://www.youtube.com/c/${identifier.username}`);
  }

  return Array.from(candidates);
}

async function fetchChannelMetadataFromHtml(urls: string[]): Promise<HtmlChannelMetadata | null> {
  for (const url of urls) {
    try {
      const response = await fetch(url, { method: "GET" });
      if (!response.ok) {
        continue;
      }
      const html = await response.text();
      const channelId = extractChannelIdFromHtml(html);
      const thumbnailUrl = extractThumbnailFromHtml(html);
      const title = extractTitleFromHtml(html);
      if (channelId || thumbnailUrl || title) {
        return { channelId, thumbnailUrl, title };
      }
    } catch (error) {
      console.warn(`[yt-clip] Failed to fetch channel page ${url}`, error);
    }
  }
  return null;
}

function extractChannelIdFromHtml(html: string): string | null {
  const browseMatch = html.match(/"browseId":"(UC[0-9A-Za-z_-]{22})"/);
  if (browseMatch?.[1]) {
    return browseMatch[1];
  }
  const channelMatch = html.match(/"channelId":"(UC[0-9A-Za-z_-]{22})"/);
  if (channelMatch?.[1]) {
    return channelMatch[1];
  }
  return null;
}

function extractThumbnailFromHtml(html: string): string | null {
  const avatarMatch = html.match(/"avatar":\{[^}]*"url":"([^"]+)"/);
  const ogImageMatch = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i);
  const raw = avatarMatch?.[1] ?? ogImageMatch?.[1];
  return sanitizeThumbnailUrl(raw ?? null);
}

function extractTitleFromHtml(html: string): string | null {
  const ogTitleMatch = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i);
  if (ogTitleMatch?.[1]) {
    return decodeHtmlEntities(ogTitleMatch[1]);
  }
  const titleTagMatch = html.match(/<title>([^<]+)<\/title>/i);
  if (titleTagMatch?.[1]) {
    return decodeHtmlEntities(titleTagMatch[1]);
  }
  return null;
}

function sanitizeThumbnailUrl(raw: string | null): string | null {
  if (!raw) {
    return null;
  }
  const unescaped = decodeHtmlEntities(
    raw
      .replace(/\\u0026/gi, "&")
      .replace(/\\u003d/gi, "=")
      .replace(/\\u002f/gi, "/")
      .replace(/\\\\//g, "/")
  );
  const trimmed = unescaped.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }
  if (!/^https?:/i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      return url.toString();
    } catch {
      return null;
    }
  }
  return trimmed;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}
function numberFromRowId(rowId: number | undefined): number {
  if (typeof rowId === "number") {
    return rowId;
  }
  if (typeof rowId === "bigint") {
    return Number(rowId);
  }
  throw new HttpError(500, "Failed to determine row id");
}

async function readJson(request: Request): Promise<any> {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}

function toVideoRowDetails(row: VideoRow): {
  durationSec: number | null;
  description: string | null;
  captionsJson: string | null;
} {
  return {
    durationSec: row.duration_sec,
    description: row.description,
    captionsJson: row.captions_json
  };
}

function detectFromDescription(video: { durationSec: number | null; description: string | null }): ClipCandidateResponse[] {
  const description = video.description;
  if (!description) {
    return [];
  }
  const lines = description.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
  const chapters: { start: number; label: string }[] = [];
  for (const line of lines) {
    const match = line.match(TIMESTAMP_PATTERN);
    if (!match) {
      continue;
    }
    const hour = match[1] ? Number(match[1]) : 0;
    const minute = Number(match[2]);
    const second = Number(match[3]);
    if (!Number.isFinite(minute) || !Number.isFinite(second)) {
      continue;
    }
    const start = hour * 3600 + minute * 60 + second;
    const label = match[4]?.trim() || "Chapter";
    chapters.push({ start, label });
  }
  chapters.sort((a, b) => a.start - b.start);
  if (chapters.length === 0) {
    return [];
  }
  const responses: ClipCandidateResponse[] = [];
  for (let i = 0; i < chapters.length; i += 1) {
    const current = chapters[i];
    const next = chapters[i + 1];
    let end = next ? next.start : current.start + DEFAULT_CLIP_LENGTH;
    if (video.durationSec != null) {
      end = Math.min(end, video.durationSec);
    }
    end = Math.max(current.start + 5, end);
    let score = 0.6;
    if (containsKeyword(current.label)) {
      score += 0.3;
    }
    responses.push({
      startSec: current.start,
      endSec: end,
      score,
      label: current.label
    });
  }
  return responses;
}

function scoreForSectionSource(source: VideoSectionSource): number {
  switch (source) {
    case "YOUTUBE_CHAPTER":
      return 0.95;
    case "COMMENT":
      return 0.85;
    case "VIDEO_DESCRIPTION":
      return 0.6;
    default:
      return 0.5;
  }
}

function toClipCandidateFromSection(section: VideoSectionResponse): ClipCandidateResponse {
  return {
    startSec: section.startSec,
    endSec: section.endSec,
    score: scoreForSectionSource(section.source),
    label: section.title
  };
}

function mergeClipCandidates(...lists: ClipCandidateResponse[][]): ClipCandidateResponse[] {
  const merged = new Map<string, ClipCandidateResponse>();
  for (const list of lists) {
    for (const candidate of list) {
      const key = `${candidate.startSec}-${candidate.endSec}`;
      const existing = merged.get(key);
      if (!existing || candidate.score > existing.score) {
        merged.set(key, candidate);
      }
    }
  }
  const result = Array.from(merged.values());
  result.sort((a, b) => a.startSec - b.startSec);
  return result;
}

async function detectFromChapterSources(
  env: Env,
  youtubeVideoId: string,
  durationSec: number | null
): Promise<ClipCandidateResponse[]> {
  const normalizedVideoId = youtubeVideoId.trim();
  if (!normalizedVideoId) {
    return [];
  }

  const apiSections = await fetchVideoSectionsFromApi(env, normalizedVideoId, durationSec);
  if (apiSections.length > 0) {
    return apiSections.map(toClipCandidateFromSection);
  }

  const commentSections = await fetchVideoSectionsFromComments(env, normalizedVideoId, durationSec);
  if (commentSections.length === 0) {
    return [];
  }
  return commentSections.map(toClipCandidateFromSection);
}

function detectFromCaptions(video: { durationSec: number | null; captionsJson: string | null }): ClipCandidateResponse[] {
  const captionsJson = video.captionsJson;
  if (!captionsJson) {
    return [];
  }
  const lines = parseCaptions(captionsJson);
  if (lines.length === 0) {
    return [];
  }
  const responses: ClipCandidateResponse[] = [];
  for (const line of lines) {
    const start = line.start;
    let end = start + DEFAULT_CLIP_LENGTH;
    if (video.durationSec != null) {
      end = Math.min(end, video.durationSec);
    }
    if (containsKeyword(line.text)) {
      responses.push({ startSec: start, endSec: end, score: 0.8, label: line.text });
    }
  }
  if (responses.length > 0) {
    return responses;
  }
  const fallback: ClipCandidateResponse[] = [];
  for (const line of lines) {
    const start = line.start;
    let end = start + 45;
    if (video.durationSec != null) {
      end = Math.min(end, video.durationSec);
    }
    fallback.push({ startSec: start, endSec: end, score: 0.4, label: truncate(line.text) });
    if (fallback.length >= 5) {
      break;
    }
  }
  return fallback;
}

function parseCaptions(captionsJson: string): { start: number; text: string }[] {
  const trimmed = captionsJson.trim();
  try {
    if (trimmed.startsWith("[")) {
      const parsed = JSON.parse(trimmed) as Array<Record<string, unknown>>;
      const lines = parsed
        .map((node) => {
          const startValue = node.start ?? node.offset ?? 0;
          const start = typeof startValue === "number" ? Math.floor(startValue) : Number.parseInt(String(startValue), 10);
          const textValue = node.text ?? node.content ?? "";
          const text = typeof textValue === "string" ? textValue : String(textValue ?? "");
          return { start, text };
        })
        .filter((line) => Number.isFinite(line.start));
      lines.sort((a, b) => a.start - b.start);
      return lines;
    }
  } catch {
    // ignore JSON errors and fallback to plain text parsing below
  }
  const lines: { start: number; text: string }[] = [];
  for (const raw of trimmed.split(/\r?\n/)) {
    const [startPart, textPart] = raw.split("|", 2);
    if (!textPart) {
      continue;
    }
    const start = Number.parseInt(startPart.trim(), 10);
    if (!Number.isFinite(start)) {
      continue;
    }
    lines.push({ start, text: textPart.trim() });
  }
  lines.sort((a, b) => a.start - b.start);
  return lines;
}

function containsKeyword(text: string): boolean {
  const lower = text.toLowerCase();
  return KEYWORDS.some((keyword) => lower.includes(keyword));
}

function truncate(text: string): string {
  if (text.length <= 40) {
    return text;
  }
  return `${text.slice(0, 40)}...`;
}

export function __setWorkerTestOverrides(overrides: Partial<WorkerTestOverrides>): void {
  if (overrides.fetchVideoMetadata) {
    testOverrides.fetchVideoMetadata = overrides.fetchVideoMetadata;
  }
  if (overrides.fetchChannelMetadata) {
    testOverrides.fetchChannelMetadata = overrides.fetchChannelMetadata;
  }
  if (overrides.detectFromChapterSources) {
    testOverrides.detectFromChapterSources = overrides.detectFromChapterSources;
  }
  if (overrides.detectFromDescription) {
    testOverrides.detectFromDescription = overrides.detectFromDescription;
  }
  if (overrides.detectFromCaptions) {
    testOverrides.detectFromCaptions = overrides.detectFromCaptions;
  }
}

export function __resetWorkerTestState(): void {
  testOverrides.fetchVideoMetadata = fetchVideoMetadata;
  testOverrides.fetchChannelMetadata = fetchChannelMetadata;
  testOverrides.detectFromChapterSources = detectFromChapterSources;
  testOverrides.detectFromDescription = detectFromDescription;
  testOverrides.detectFromCaptions = detectFromCaptions;
  hasEnsuredSchema = false;
  hasEnsuredArtistDisplayNameColumn = false;
  hasEnsuredArtistProfileImageColumn = false;
  hasEnsuredArtistChannelTitleColumn = false;
  hasEnsuredArtistCountryColumns = false;
  hasEnsuredArtistAgencyColumn = false;
  hasEnsuredVideoContentTypeColumn = false;
  hasEnsuredVideoHiddenColumn = false;
  hasEnsuredVideoCategoryColumn = false;
  hasEnsuredVideoOriginalComposerColumn = false;
  hasEnsuredClipOriginalComposerColumn = false;
  hasEnsuredVideoArtistsTable = false;
}

export function __setHasEnsuredVideoColumnsForTests(value: boolean): void {
  hasEnsuredArtistDisplayNameColumn = value;
  hasEnsuredArtistProfileImageColumn = value;
  hasEnsuredArtistChannelTitleColumn = value;
  hasEnsuredArtistCountryColumns = value;
  hasEnsuredArtistAgencyColumn = value;
  hasEnsuredVideoContentTypeColumn = value;
  hasEnsuredVideoHiddenColumn = value;
  hasEnsuredVideoCategoryColumn = value;
  hasEnsuredVideoOriginalComposerColumn = value;
  hasEnsuredClipOriginalComposerColumn = value;
  hasEnsuredVideoArtistsTable = value;
}

export {
  suggestClipCandidates as __suggestClipCandidatesForTests,
  getOrCreateVideoByUrl as __getOrCreateVideoByUrlForTests,
  updateVideoCategory as __updateVideoCategoryForTests,
  updateVideoMetadata as __updateVideoMetadataForTests,
  updateClip as __updateClipForTests,
  listClips as __listClipsForTests,
  listMediaLibrary as __listMediaLibraryForTests,
  listVideos as __listVideosForTests,
  createArtist as __createArtistForTests,
  listArtists as __listArtistsForTests,
  fetchVideoSectionsFromComments as __fetchVideoSectionsFromCommentsForTests,
  extractSectionsFromText as __extractSectionsFromTextForTests
};
