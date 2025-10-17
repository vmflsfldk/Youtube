-- Ensure clip time ranges are unique per video
CREATE UNIQUE INDEX IF NOT EXISTS idx_clips_video_range ON clips(video_id, start_sec, end_sec);
