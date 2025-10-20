CREATE TABLE IF NOT EXISTS playlists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'PRIVATE',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK (
    visibility IN ('PRIVATE', 'UNLISTED', 'PUBLIC')
  )
);

CREATE TRIGGER IF NOT EXISTS trg_playlists_updated_at
AFTER UPDATE ON playlists
FOR EACH ROW
BEGIN
  UPDATE playlists
     SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
   WHERE id = NEW.id;
END;

CREATE TABLE IF NOT EXISTS playlist_items (
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
  CHECK (
    (video_id IS NOT NULL AND clip_id IS NULL)
    OR (video_id IS NULL AND clip_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_playlist_items_playlist_order
  ON playlist_items(playlist_id, ordering);

CREATE INDEX IF NOT EXISTS idx_playlist_items_video
  ON playlist_items(video_id);

CREATE INDEX IF NOT EXISTS idx_playlist_items_clip
  ON playlist_items(clip_id);

CREATE TRIGGER IF NOT EXISTS trg_playlist_items_updated_at
AFTER UPDATE ON playlist_items
FOR EACH ROW
BEGIN
  UPDATE playlist_items
     SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
   WHERE id = NEW.id;
END;
