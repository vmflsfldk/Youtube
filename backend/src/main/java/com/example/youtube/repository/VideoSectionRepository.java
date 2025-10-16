package com.example.youtube.repository;

import com.example.youtube.model.Video;
import com.example.youtube.model.VideoSection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface VideoSectionRepository extends JpaRepository<VideoSection, Long> {

    void deleteByVideo(Video video);

    List<VideoSection> findByVideo(Video video);

    List<VideoSection> findByVideoIn(List<Video> videos);
}
