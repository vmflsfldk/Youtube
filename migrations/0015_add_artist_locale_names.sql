ALTER TABLE artists
    ADD COLUMN name_ko TEXT,
    ADD COLUMN name_jp TEXT,
    ADD COLUMN name_en TEXT;

UPDATE artists a
SET name_ko = an.value_text
FROM artist_names an
WHERE an.artist_id = a.id
  AND an.language_code = 'ko'
  AND a.name_ko IS NULL;

UPDATE artists a
SET name_jp = sub.value_text
FROM (
    SELECT artist_id,
           value_text,
           ROW_NUMBER() OVER (PARTITION BY artist_id ORDER BY CASE language_code WHEN 'ja' THEN 0 ELSE 1 END, id) AS rn
    FROM artist_names
    WHERE language_code IN ('ja', 'jp')
) sub
WHERE sub.artist_id = a.id
  AND sub.rn = 1
  AND a.name_jp IS NULL;

UPDATE artists a
SET name_en = an.value_text
FROM artist_names an
WHERE an.artist_id = a.id
  AND an.language_code = 'en'
  AND a.name_en IS NULL;
