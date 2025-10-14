package com.example.youtube.repository;

import com.example.youtube.model.Artist;
import com.example.youtube.model.Video;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface VideoRepository extends JpaRepository<Video, Long> {
    Optional<Video> findByYoutubeVideoId(String youtubeVideoId);

    java.util.List<Video> findByArtist(Artist artist);
}
