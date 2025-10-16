ALTER TABLE artists
    ADD COLUMN available_ko INTEGER NOT NULL DEFAULT 0;

-- statement-breakpoint

ALTER TABLE artists
    ADD COLUMN available_en INTEGER NOT NULL DEFAULT 0;

-- statement-breakpoint

ALTER TABLE artists
    ADD COLUMN available_jp INTEGER NOT NULL DEFAULT 0;
