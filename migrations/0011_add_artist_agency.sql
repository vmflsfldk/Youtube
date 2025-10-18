ALTER TABLE artists ADD COLUMN agency VARCHAR(255);

CREATE INDEX idx_artists_agency ON artists(agency);
