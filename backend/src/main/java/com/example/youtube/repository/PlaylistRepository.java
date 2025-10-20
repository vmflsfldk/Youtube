package com.example.youtube.repository;

import com.example.youtube.model.Playlist;
import com.example.youtube.model.Playlist.PlaylistVisibility;
import com.example.youtube.model.UserAccount;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PlaylistRepository extends JpaRepository<Playlist, Long> {

    @EntityGraph(attributePaths = {
            "items",
            "items.video",
            "items.video.artist",
            "items.clip",
            "items.clip.video",
            "items.clip.video.artist"
    })
    List<Playlist> findAllByOwnerOrderByCreatedAtDesc(UserAccount owner);

    @EntityGraph(attributePaths = {
            "items",
            "items.video",
            "items.video.artist",
            "items.clip",
            "items.clip.video",
            "items.clip.video.artist"
    })
    Optional<Playlist> findByIdAndOwner(Long id, UserAccount owner);

    @EntityGraph(attributePaths = {
            "items",
            "items.video",
            "items.video.artist",
            "items.clip",
            "items.clip.video",
            "items.clip.video.artist"
    })
    List<Playlist> findAllByVisibilityOrderByCreatedAtDesc(PlaylistVisibility visibility);
}
