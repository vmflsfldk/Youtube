ALTER TABLE artists
    ADD COLUMN updated_at TEXT;

-- statement-breakpoint

UPDATE artists
SET updated_at = COALESCE(created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

-- statement-breakpoint

CREATE TRIGGER IF NOT EXISTS trg_artists_updated_at
AFTER UPDATE ON artists
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE artists
    SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = NEW.id;
END;

-- statement-breakpoint

CREATE TRIGGER IF NOT EXISTS trg_artists_set_updated_at_on_insert
AFTER INSERT ON artists
FOR EACH ROW
WHEN NEW.updated_at IS NULL
BEGIN
    UPDATE artists
    SET updated_at = COALESCE(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    WHERE id = NEW.id;
END;

-- statement-breakpoint
