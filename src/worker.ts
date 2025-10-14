interface Env {
  DB: D1Database;
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
  youtubeChannelId: string;
}

interface VideoResponse {
  id: number;
  artistId: number;
  youtubeVideoId: string;
  title: string;
  durationSec?: number | null;
  thumbnailUrl?: string | null;
  channelId?: string | null;
}

interface ClipResponse {
  id: number;
  videoId: number;
  title: string;
  startSec: number;
  endSec: number;
  tags: string[];
}

interface ClipCandidateResponse {
  startSec: number;
  endSec: number;
  score: number;
  label: string;
}

interface CorsConfig {
  origin: string | null;
  requestHeaders: string | null;
}

const DEFAULT_ALLOWED_HEADERS = ["Content-Type", "X-User-Email", "X-User-Name"] as const;

const formatAllowedHeaders = (requestedHeaders: string | null): string => {
  const headerMap = new Map<string, string>();
  for (const header of DEFAULT_ALLOWED_HEADERS) {
    headerMap.set(header.toLowerCase(), header);
  }
  if (requestedHeaders) {
    for (const rawHeader of requestedHeaders.split(",")) {
      const header = rawHeader.trim();
      if (!header) {
        continue;
      }
      const lower = header.toLowerCase();
      headerMap.set(lower, header);
    }
  }
  return Array.from(headerMap.values()).join(", ");
};

const ALLOWED_ORIGINS = new Set<string>([
  "https://youtube-1my.pages.dev",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173"
]);

const ALLOWED_ORIGIN_HOST_SUFFIXES = ["youtube-1my.pages.dev"] as const;

const isAllowedOrigin = (origin: string): boolean => {
  if (ALLOWED_ORIGINS.has(origin)) {
    return true;
  }

  try {
    const { hostname } = new URL(origin);
    return ALLOWED_ORIGIN_HOST_SUFFIXES.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`));
  } catch {
    return false;
  }
};

const resolveAllowedOrigin = (origin: string | null): string | null => {
  if (!origin) {
    return "*";
  }
  if (isAllowedOrigin(origin)) {
    return origin;
  }
  return null;
};

interface UserContext {
  id: number;
  email: string;
  displayName: string;
}

interface ArtistRow {
  id: number;
  name: string;
  youtube_channel_id: string;
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
}

interface ClipRow {
  id: number;
  video_id: number;
  title: string;
  start_sec: number;
  end_sec: number;
}

const DEFAULT_CLIP_LENGTH = 30;
const KEYWORDS = ["chorus", "hook", "verse", "intro", "outro"];
const TIMESTAMP_PATTERN = /^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\s*-?\s*(.*)$/i;

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const corsHeaders = (config: CorsConfig): Headers => {
  const headers = new Headers();
  const allowedOrigin = resolveAllowedOrigin(config.origin);
  if (allowedOrigin) {
    headers.set("Access-Control-Allow-Origin", allowedOrigin);
  }
  if (allowedOrigin && allowedOrigin !== "*") {
    headers.set("Vary", "Origin");
  }
  headers.append("Vary", "Access-Control-Request-Headers");
  headers.append("Vary", "Access-Control-Request-Method");
  headers.set("Access-Control-Allow-Headers", formatAllowedHeaders(config.requestHeaders));
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (allowedOrigin && allowedOrigin !== "*") {
    headers.set("Access-Control-Allow-Credentials", "true");
  }
  headers.set("Access-Control-Max-Age", "86400");
  return headers;
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
    const cors: CorsConfig = {
      origin: request.headers.get("Origin"),
      requestHeaders: request.headers.get("Access-Control-Request-Headers")
    };

    if (request.method === "OPTIONS") {
      return emptyResponse(204, cors);
    }

    const url = new URL(request.url);
    const path = normalizePath(url.pathname);

    try {
      if (request.method === "POST" && path === "/api/users/login") {
        return await loginUser(request, env, cors);
      }

      const user = await getOrCreateUser(env, request.headers);

      if (request.method === "POST" && path === "/api/artists") {
        return await createArtist(request, env, user, cors);
      }
      if (request.method === "GET" && path === "/api/artists") {
        return await listArtists(url, env, user, cors);
      }
      if (request.method === "POST" && path === "/api/users/me/favorites") {
        return await toggleFavorite(request, env, user, cors);
      }
      if (path === "/api/videos") {
        if (request.method === "POST") {
          return await createVideo(request, env, user, cors);
        }
        if (request.method === "GET") {
          return await listVideos(url, env, user, cors);
        }
      }
      if (path === "/api/clips") {
        if (request.method === "POST") {
          return await createClip(request, env, user, cors);
        }
        if (request.method === "GET") {
          return await listClips(url, env, user, cors);
        }
      }
      if (request.method === "POST" && path === "/api/clips/auto-detect") {
        return await autoDetect(request, env, user, cors);
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
};

async function createArtist(
  request: Request,
  env: Env,
  user: UserContext,
  cors: CorsConfig
): Promise<Response> {
  const body = await readJson(request);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const youtubeChannelId = typeof body.youtubeChannelId === "string" ? body.youtubeChannelId.trim() : "";
  if (!name) {
    throw new HttpError(400, "name is required");
  }
  if (!youtubeChannelId) {
    throw new HttpError(400, "youtubeChannelId is required");
  }

  const result = await env.DB.prepare(
    "INSERT INTO artists (name, youtube_channel_id, created_by) VALUES (?, ?, ?)"
  ).bind(name, youtubeChannelId, user.id).run();
  const artistId = numberFromRowId(result.meta.last_row_id);
  return jsonResponse({ id: artistId, name, youtubeChannelId } satisfies ArtistResponse, 201, cors);
}

async function listArtists(url: URL, env: Env, user: UserContext, cors: CorsConfig): Promise<Response> {
  const mine = url.searchParams.get("mine") === "true";
  const query = mine
    ? `SELECT a.id, a.name, a.youtube_channel_id
         FROM artists a
         JOIN user_favorite_artists ufa ON ufa.artist_id = a.id
        WHERE ufa.user_id = ?
        ORDER BY a.name`
    : `SELECT id, name, youtube_channel_id
         FROM artists
        WHERE created_by = ?
        ORDER BY id DESC`;
  const { results } = await env.DB.prepare(query).bind(user.id).all<ArtistRow>();
  const artists = (results ?? []).map(toArtistResponse);
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
  await ensureArtist(env, artistId, user.id);

  const videoUrl = typeof body.videoUrl === "string" ? body.videoUrl : "";
  const description = typeof body.description === "string" ? body.description : null;
  const captionsJson = typeof body.captionsJson === "string" ? body.captionsJson : null;
  const videoId = extractVideoId(videoUrl);
  if (!videoId) {
    throw new HttpError(400, "Unable to parse videoId from URL");
  }

  const metadata = await fetchVideoMetadata(videoId);
  const existing = await env.DB.prepare(
    "SELECT id FROM videos WHERE youtube_video_id = ?"
  ).bind(videoId).first<{ id: number }>();

  if (existing) {
    await env.DB.prepare(
      `UPDATE videos
          SET artist_id = ?,
              title = ?,
              duration_sec = ?,
              thumbnail_url = ?,
              channel_id = ?,
              description = ?,
              captions_json = ?
        WHERE id = ?`
    ).bind(
      artistId,
      metadata.title ?? "Untitled",
      metadata.durationSec,
      metadata.thumbnailUrl,
      metadata.channelId,
      description,
      captionsJson,
      existing.id
    ).run();
    const row = await env.DB.prepare("SELECT * FROM videos WHERE id = ?")
      .bind(existing.id)
      .first<VideoRow>();
    if (!row) {
      throw new HttpError(500, "Failed to load updated video");
    }
    return jsonResponse(toVideoResponse(row), 200, cors);
  }

  const result = await env.DB.prepare(
    `INSERT INTO videos (artist_id, youtube_video_id, title, duration_sec, thumbnail_url, channel_id, description, captions_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    artistId,
    videoId,
    metadata.title ?? "Untitled",
    metadata.durationSec,
    metadata.thumbnailUrl,
    metadata.channelId,
    description,
    captionsJson
  ).run();

  const insertedId = numberFromRowId(result.meta.last_row_id);
  const row = await env.DB.prepare("SELECT * FROM videos WHERE id = ?")
    .bind(insertedId)
    .first<VideoRow>();
  if (!row) {
    throw new HttpError(500, "Failed to load created video");
  }
  return jsonResponse(toVideoResponse(row), 201, cors);
}

async function listVideos(url: URL, env: Env, user: UserContext, cors: CorsConfig): Promise<Response> {
  const artistIdParam = url.searchParams.get("artistId");
  const artistId = artistIdParam ? Number(artistIdParam) : NaN;
  if (!Number.isFinite(artistId)) {
    throw new HttpError(400, "artistId query parameter is required");
  }
  await ensureArtist(env, artistId, user.id);
  const { results } = await env.DB.prepare(
    `SELECT * FROM videos WHERE artist_id = ? ORDER BY id DESC`
  ).bind(artistId).all<VideoRow>();
  const videos = (results ?? []).map(toVideoResponse);
  return jsonResponse(videos, 200, cors);
}

async function createClip(
  request: Request,
  env: Env,
  user: UserContext,
  cors: CorsConfig
): Promise<Response> {
  const body = await readJson(request);
  const videoId = Number(body.videoId);
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const startSec = Number(body.startSec);
  const endSec = Number(body.endSec);
  const tags = Array.isArray(body.tags) ? body.tags : [];

  if (!Number.isFinite(videoId)) {
    throw new HttpError(400, "videoId must be a number");
  }
  if (!title) {
    throw new HttpError(400, "title is required");
  }
  if (!Number.isFinite(startSec) || !Number.isFinite(endSec)) {
    throw new HttpError(400, "startSec and endSec must be numbers");
  }
  if (endSec <= startSec) {
    throw new HttpError(400, "endSec must be greater than startSec");
  }
  await ensureVideo(env, videoId, user.id);

  const result = await env.DB.prepare(
    `INSERT INTO clips (video_id, title, start_sec, end_sec) VALUES (?, ?, ?, ?)`
  ).bind(videoId, title, startSec, endSec).run();
  const clipId = numberFromRowId(result.meta.last_row_id);

  const normalizedTags = tags
    .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
    .filter((tag) => tag.length > 0);
  for (const tag of normalizedTags) {
    await env.DB.prepare("INSERT INTO clip_tags (clip_id, tag) VALUES (?, ?)").bind(clipId, tag).run();
  }

  const clipRow = await env.DB.prepare("SELECT id, video_id, title, start_sec, end_sec FROM clips WHERE id = ?")
    .bind(clipId)
    .first<ClipRow>();
  if (!clipRow) {
    throw new HttpError(500, "Failed to load created clip");
  }
  const clip = await attachTags(env, [clipRow]);
  return jsonResponse(clip[0], 201, cors);
}

async function listClips(url: URL, env: Env, user: UserContext, cors: CorsConfig): Promise<Response> {
  const artistIdParam = url.searchParams.get("artistId");
  const videoIdParam = url.searchParams.get("videoId");
  if (artistIdParam) {
    const artistId = Number(artistIdParam);
    if (!Number.isFinite(artistId)) {
      throw new HttpError(400, "artistId must be a number");
    }
    await ensureArtist(env, artistId, user.id);
    const { results } = await env.DB.prepare(
      `SELECT c.id, c.video_id, c.title, c.start_sec, c.end_sec
         FROM clips c
         JOIN videos v ON v.id = c.video_id
        WHERE v.artist_id = ?
        ORDER BY c.start_sec`
    ).bind(artistId).all<ClipRow>();
    const clips = await attachTags(env, results ?? []);
    return jsonResponse(clips, 200, cors);
  }
  if (videoIdParam) {
    const videoId = Number(videoIdParam);
    if (!Number.isFinite(videoId)) {
      throw new HttpError(400, "videoId must be a number");
    }
    await ensureVideo(env, videoId, user.id);
    const { results } = await env.DB.prepare(
      `SELECT id, video_id, title, start_sec, end_sec
         FROM clips
        WHERE video_id = ?
        ORDER BY start_sec`
    ).bind(videoId).all<ClipRow>();
    const clips = await attachTags(env, results ?? []);
    return jsonResponse(clips, 200, cors);
  }
  throw new HttpError(400, "artistId or videoId query parameter is required");
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
       JOIN artists a ON a.id = v.artist_id
      WHERE v.id = ?
        AND a.created_by = ?`
  )
    .bind(videoId, user.id)
    .first<VideoRow>();
  if (!row) {
    throw new HttpError(404, `Video not found: ${videoId}`);
  }
  const mode = modeRaw ? modeRaw.toLowerCase() : "chapters";
  const video = toVideoRowDetails(row);

  let candidates: ClipCandidateResponse[];
  if (mode === "chapters") {
    candidates = detectFromDescription(video);
  } else if (mode === "captions") {
    candidates = detectFromCaptions(video);
  } else {
    const combined = [...detectFromDescription(video), ...detectFromCaptions(video)];
    combined.sort((a, b) => a.startSec - b.startSec);
    candidates = combined;
  }
  return jsonResponse(candidates, 200, cors);
}

async function getOrCreateUser(env: Env, headers: Headers): Promise<UserContext> {
  const emailHeader = headers.get("X-User-Email");
  const displayNameHeader = headers.get("X-User-Name");
  const email = emailHeader && emailHeader.trim() ? emailHeader.trim() : "guest@example.com";
  const displayName = displayNameHeader && displayNameHeader.trim() ? displayNameHeader.trim() : "Guest";
  return await upsertUser(env, email, displayName);
}

async function loginUser(request: Request, env: Env, cors: CorsConfig): Promise<Response> {
  const body = await readJson(request);
  const emailRaw = typeof body.email === "string" ? body.email : "";
  const displayNameRaw = typeof body.displayName === "string" ? body.displayName : "";
  const email = emailRaw.trim() || "guest@example.com";
  const displayName = displayNameRaw.trim() || "Guest";
  const user = await upsertUser(env, email, displayName);
  return jsonResponse(user, 200, cors);
}

async function upsertUser(env: Env, email: string, displayName: string): Promise<UserContext> {
  const existing = await env.DB.prepare(
    "SELECT id, email, display_name FROM users WHERE email = ?"
  ).bind(email).first<{ id: number; email: string; display_name: string }>();
  if (existing) {
    if (displayName && displayName !== existing.display_name) {
      await env.DB.prepare("UPDATE users SET display_name = ? WHERE id = ?")
        .bind(displayName, existing.id)
        .run();
      existing.display_name = displayName;
    }
    return { id: existing.id, email: existing.email, displayName: existing.display_name };
  }
  const result = await env.DB.prepare(
    "INSERT INTO users (email, display_name) VALUES (?, ?)"
  ).bind(email, displayName).run();
  const userId = numberFromRowId(result.meta.last_row_id);
  return { id: userId, email, displayName };
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

async function ensureVideo(env: Env, videoId: number, userId: number): Promise<void> {
  const video = await env.DB.prepare(
    `SELECT v.id
       FROM videos v
       JOIN artists a ON a.id = v.artist_id
      WHERE v.id = ?
        AND a.created_by = ?`
  )
    .bind(videoId, userId)
    .first<{ id: number }>();
  if (!video) {
    throw new HttpError(404, `Video not found: ${videoId}`);
  }
}

function toArtistResponse(row: ArtistRow): ArtistResponse {
  return {
    id: row.id,
    name: row.name,
    youtubeChannelId: row.youtube_channel_id
  };
}

function toVideoResponse(row: VideoRow): VideoResponse {
  return {
    id: row.id,
    artistId: row.artist_id,
    youtubeVideoId: row.youtube_video_id,
    title: row.title,
    durationSec: row.duration_sec ?? null,
    thumbnailUrl: row.thumbnail_url ?? null,
    channelId: row.channel_id ?? null
  };
}

async function attachTags(env: Env, rows: ClipRow[] | undefined): Promise<ClipResponse[]> {
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
  return clips.map((clip) => ({
    id: clip.id,
    videoId: clip.video_id,
    title: clip.title,
    startSec: Number(clip.start_sec),
    endSec: Number(clip.end_sec),
    tags: tagsMap.get(clip.id) ?? []
  } satisfies ClipResponse));
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

async function fetchVideoMetadata(videoId: string): Promise<{
  title: string;
  durationSec: number | null;
  thumbnailUrl: string | null;
  channelId: string | null;
}> {
  // Placeholder implementation. Replace with real YouTube API integration if needed.
  return {
    title: `Video ${videoId}`,
    durationSec: null,
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    channelId: null
  };
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
