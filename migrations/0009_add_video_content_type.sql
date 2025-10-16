ALTER TABLE videos ADD COLUMN content_type TEXT NOT NULL DEFAULT 'OFFICIAL';

-- statement-breakpoint

UPDATE videos
   SET content_type = 'OFFICIAL'
 WHERE content_type IS NULL OR TRIM(content_type) = '';
