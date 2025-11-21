ALTER TABLE artists ADD COLUMN chzzk_channel_id VARCHAR(255);
CREATE INDEX IF NOT EXISTS idx_artists_chzzk_channel ON artists(chzzk_channel_id);
