package com.example.youtube.repository;

import com.example.youtube.model.Artist;
import com.example.youtube.model.Clip;
import com.example.youtube.model.Video;
import java.util.List;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ClipRepository extends JpaRepository<Clip, Long> {
    @Query("SELECT c FROM Clip c WHERE c.video.artist = :artist")
    List<Clip> findByArtist(@Param("artist") Artist artist);

    @EntityGraph(attributePaths = "tags")
    @Query("SELECT c FROM Clip c WHERE c.video.artist = :artist")
    List<Clip> findByArtistWithTags(@Param("artist") Artist artist);

    List<Clip> findByVideo(Video video);

    @EntityGraph(attributePaths = "tags")
    @Query("SELECT c FROM Clip c WHERE c.video = :video")
    List<Clip> findByVideoWithTags(@Param("video") Video video);

    boolean existsByVideoAndStartSecAndEndSec(Video video, int startSec, int endSec);

    boolean existsByVideoAndStartSecAndEndSecAndIdNot(Video video, int startSec, int endSec, Long id);
}
