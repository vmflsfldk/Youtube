PRAGMA foreign_keys = ON;

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS video_sections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    start_sec INTEGER NOT NULL,
    end_sec INTEGER NOT NULL,
    source TEXT NOT NULL,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
);

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_video_sections_video ON video_sections(video_id);
