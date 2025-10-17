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
            LEFT JOIN a.tags t
            WHERE (:name IS NULL OR :name = '' OR LOWER(a.name) LIKE LOWER(CONCAT('%', :name, '%'))
                   OR LOWER(a.displayName) LIKE LOWER(CONCAT('%', :name, '%')))
              AND (:tag IS NULL OR :tag = '' OR LOWER(t) LIKE LOWER(CONCAT('%', :tag, '%')))
            """)
    List<Artist> search(@Param("name") String name, @Param("tag") String tag);
}
