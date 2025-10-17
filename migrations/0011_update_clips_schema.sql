PRAGMA foreign_keys = OFF;

ALTER TABLE clips RENAME TO clips_old;

CREATE TABLE clips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id INTEGER,
    artist_id INTEGER,
    youtube_video_id TEXT NOT NULL,
    title TEXT NOT NULL,
    start_sec INTEGER NOT NULL,
    end_sec INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE SET NULL,
    FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE SET NULL
);

INSERT INTO clips (id, video_id, artist_id, youtube_video_id, title, start_sec, end_sec, created_at)
SELECT c.id,
       c.video_id,
       v.artist_id,
       v.youtube_video_id,
       c.title,
       c.start_sec,
       c.end_sec,
       c.created_at
  FROM clips_old AS c
  LEFT JOIN videos AS v ON v.id = c.video_id;

DROP TABLE clips_old;

CREATE INDEX IF NOT EXISTS idx_clips_video ON clips(video_id);
CREATE INDEX IF NOT EXISTS idx_clips_artist ON clips(artist_id);
CREATE INDEX IF NOT EXISTS idx_clip_tags_clip ON clip_tags(clip_id);

PRAGMA foreign_keys = ON;
