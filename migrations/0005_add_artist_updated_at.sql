ALTER TABLE artists ADD COLUMN updated_at TEXT;

UPDATE artists
   SET updated_at = COALESCE(updated_at, created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

CREATE TRIGGER IF NOT EXISTS trg_artists_updated_at
AFTER UPDATE ON artists
FOR EACH ROW
BEGIN
    UPDATE artists SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;
