PRAGMA foreign_keys = ON;

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS video_artists (
    video_id INTEGER NOT NULL,
    artist_id INTEGER NOT NULL,
    is_primary INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (video_id, artist_id),
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
    FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
);

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_video_artists_artist ON video_artists(artist_id, video_id);

-- statement-breakpoint

INSERT OR IGNORE INTO video_artists (video_id, artist_id, is_primary)
SELECT id, artist_id, 1 FROM videos;

-- statement-breakpoint

UPDATE video_artists
   SET is_primary = 1
 WHERE (video_id, artist_id) IN (
    SELECT id, artist_id
      FROM videos
      WHERE artist_id IS NOT NULL
);
