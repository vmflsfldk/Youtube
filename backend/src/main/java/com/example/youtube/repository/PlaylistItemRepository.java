package com.example.youtube.repository;

import com.example.youtube.model.Clip;
import com.example.youtube.model.Playlist;
import com.example.youtube.model.PlaylistItem;
import com.example.youtube.model.Video;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PlaylistItemRepository extends JpaRepository<PlaylistItem, Long> {

    Optional<PlaylistItem> findByPlaylistAndVideo(Playlist playlist, Video video);

    Optional<PlaylistItem> findByPlaylistAndClip(Playlist playlist, Clip clip);
}
