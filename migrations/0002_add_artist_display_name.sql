ALTER TABLE artists ADD COLUMN display_name TEXT;

UPDATE artists
   SET display_name = name
 WHERE display_name IS NULL;
