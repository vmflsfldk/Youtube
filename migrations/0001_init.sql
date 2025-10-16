PRAGMA foreign_keys = ON;

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS artists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    youtube_channel_id TEXT NOT NULL,
    created_by INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS user_favorite_artists (
    user_id INTEGER NOT NULL,
    artist_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (user_id, artist_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
);

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    artist_id INTEGER NOT NULL,
    youtube_video_id TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    duration_sec INTEGER,
    thumbnail_url TEXT,
    channel_id TEXT,
    description TEXT,
    captions_json TEXT,
    content_type TEXT NOT NULL DEFAULT 'OFFICIAL',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
);

-- statement-breakpoint

CREATE TRIGGER IF NOT EXISTS trg_videos_updated_at
AFTER UPDATE ON videos
FOR EACH ROW
BEGIN
    UPDATE videos SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS clips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    start_sec INTEGER NOT NULL,
    end_sec INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
);

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS clip_tags (
    clip_id INTEGER NOT NULL,
    tag TEXT NOT NULL,
    FOREIGN KEY (clip_id) REFERENCES clips(id) ON DELETE CASCADE
);

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_artists_created_by ON artists(created_by);

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_videos_artist ON videos(artist_id);

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_clips_video ON clips(video_id);

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_clip_tags_clip ON clip_tags(clip_id);

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_favorites_user ON user_favorite_artists(user_id);

-- statement-breakpoint
