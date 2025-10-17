package com.example.youtube.repository;

import com.example.youtube.model.Artist;
import com.example.youtube.model.UserAccount;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ArtistRepository extends JpaRepository<Artist, Long> {
    List<Artist> findByCreatedBy(UserAccount user);

    @Query("""
            SELECT DISTINCT a FROM Artist a
            LEFT JOIN a.tags artistTag
            LEFT JOIN a.videos v
            LEFT JOIN v.clips clip
            LEFT JOIN clip.tags clipTag
            WHERE (:query IS NULL OR :query = ''
                   OR LOWER(a.name) LIKE LOWER(CONCAT('%', :query, '%'))
                   OR LOWER(a.displayName) LIKE LOWER(CONCAT('%', :query, '%'))
                   OR LOWER(a.youtubeChannelId) LIKE LOWER(CONCAT('%', :query, '%'))
                   OR LOWER(a.youtubeChannelTitle) LIKE LOWER(CONCAT('%', :query, '%'))
                   OR LOWER(artistTag) LIKE LOWER(CONCAT('%', :query, '%'))
                   OR LOWER(v.title) LIKE LOWER(CONCAT('%', :query, '%'))
                   OR LOWER(clip.title) LIKE LOWER(CONCAT('%', :query, '%'))
                   OR LOWER(clipTag) LIKE LOWER(CONCAT('%', :query, '%')))
            """)
    List<Artist> searchDirectory(@Param("query") String query);
}
