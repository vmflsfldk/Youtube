CREATE TABLE artist_tags (
    artist_id BIGINT NOT NULL,
    tag VARCHAR(255) NOT NULL,
    CONSTRAINT pk_artist_tags PRIMARY KEY (artist_id, tag),
    CONSTRAINT fk_artist_tags_artist FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
);

CREATE INDEX idx_artist_tags_tag ON artist_tags(tag);
