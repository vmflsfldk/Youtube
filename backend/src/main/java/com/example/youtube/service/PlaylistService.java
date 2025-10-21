package com.example.youtube.service;

import com.example.youtube.dto.ClipResponse;
import com.example.youtube.dto.PlaylistItemRequest;
import com.example.youtube.dto.PlaylistItemResponse;
import com.example.youtube.dto.PlaylistResponse;
import com.example.youtube.dto.VideoResponse;
import com.example.youtube.dto.VideoSectionResponse;
import com.example.youtube.model.Clip;
import com.example.youtube.model.Playlist;
import com.example.youtube.model.Playlist.PlaylistVisibility;
import com.example.youtube.model.PlaylistItem;
import com.example.youtube.model.UserAccount;
import com.example.youtube.model.Video;
import com.example.youtube.model.VideoSection;
import com.example.youtube.repository.ClipRepository;
import com.example.youtube.repository.PlaylistItemRepository;
import com.example.youtube.repository.PlaylistRepository;
import com.example.youtube.repository.VideoRepository;
import com.example.youtube.repository.VideoSectionRepository;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.stream.Collectors;
import java.util.Comparator;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PlaylistService {

    private final PlaylistRepository playlistRepository;
    private final PlaylistItemRepository playlistItemRepository;
    private final VideoRepository videoRepository;
    private final ClipRepository clipRepository;
    private final VideoSectionRepository videoSectionRepository;

    public PlaylistService(PlaylistRepository playlistRepository,
                           PlaylistItemRepository playlistItemRepository,
                           VideoRepository videoRepository,
                           ClipRepository clipRepository,
                           VideoSectionRepository videoSectionRepository) {
        this.playlistRepository = playlistRepository;
        this.playlistItemRepository = playlistItemRepository;
        this.videoRepository = videoRepository;
        this.clipRepository = clipRepository;
        this.videoSectionRepository = videoSectionRepository;
    }

    @Transactional(readOnly = true)
    public List<PlaylistResponse> getUserPlaylists(UserAccount user) {
        return playlistRepository.findAllByOwnerOrderByCreatedAtDesc(user).stream()
                .map(this::mapPlaylist)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<PlaylistResponse> getPublicClipPlaylists() {
        return playlistRepository.findAllByVisibilityOrderByCreatedAtDesc(PlaylistVisibility.PUBLIC).stream()
                .map(this::mapPlaylist)
                .collect(Collectors.toList());
    }

    @Transactional
    public PlaylistResponse addItem(Long playlistId, PlaylistItemRequest request, UserAccount user) {
        Playlist playlist = playlistRepository.findByIdAndOwner(playlistId, user)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Playlist not found"));

        boolean hasVideoId = request.videoId() != null;
        boolean hasClipId = request.clipId() != null;
        if (hasVideoId == hasClipId) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Either videoId or clipId must be provided");
        }

        if (hasVideoId) {
            Video video = videoRepository.findById(request.videoId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Video not found"));
            Optional<PlaylistItem> existing = playlistItemRepository.findByPlaylistAndVideo(playlist, video);
            if (existing.isPresent()) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Video already exists in playlist");
            }
            PlaylistItem item = new PlaylistItem(video, playlist.nextOrdering());
            playlist.addItem(item);
        } else {
            Clip clip = clipRepository.findById(request.clipId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Clip not found"));
            Optional<PlaylistItem> existing = playlistItemRepository.findByPlaylistAndClip(playlist, clip);
            if (existing.isPresent()) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Clip already exists in playlist");
            }
            PlaylistItem item = new PlaylistItem(clip, playlist.nextOrdering());
            playlist.addItem(item);
        }

        playlistRepository.saveAndFlush(playlist);
        Playlist reloaded = playlistRepository.findByIdAndOwner(playlistId, user)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Playlist not found"));
        return mapPlaylist(reloaded);
    }

    @Transactional
    public PlaylistResponse removeItem(Long playlistId, Long itemId, UserAccount user) {
        Playlist playlist = playlistRepository.findByIdAndOwner(playlistId, user)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Playlist not found"));

        PlaylistItem item = playlist.getItems().stream()
                .filter(existing -> Objects.equals(existing.getId(), itemId))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Playlist item not found"));

        playlist.removeItem(item);
        playlistRepository.saveAndFlush(playlist);
        Playlist reloaded = playlistRepository.findByIdAndOwner(playlistId, user)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Playlist not found"));
        return mapPlaylist(reloaded);
    }

    private PlaylistResponse mapPlaylist(Playlist playlist) {
        List<PlaylistItemResponse> items = new ArrayList<>();
        for (PlaylistItem item : playlist.getItemsInOrder()) {
            items.add(mapPlaylistItem(item));
        }
        return new PlaylistResponse(
                playlist.getId(),
                playlist.getOwner().getId(),
                playlist.getTitle(),
                playlist.getVisibility().name(),
                playlist.getCreatedAt(),
                playlist.getUpdatedAt(),
                items
        );
    }

    private PlaylistItemResponse mapPlaylistItem(PlaylistItem item) {
        VideoResponse videoResponse = null;
        ClipResponse clipResponse = null;
        String type;
        if (item.isVideoItem()) {
            type = "video";
            videoResponse = mapVideo(item.getVideo());
        } else if (item.isClipItem()) {
            type = "clip";
            clipResponse = mapClip(item.getClip());
        } else {
            type = "unknown";
        }
        return new PlaylistItemResponse(
                item.getId(),
                item.getPlaylist() != null ? item.getPlaylist().getId() : null,
                item.getOrdering(),
                item.getCreatedAt(),
                item.getUpdatedAt(),
                type,
                videoResponse,
                clipResponse
        );
    }

    private VideoResponse mapVideo(Video video) {
        if (video == null) {
            return null;
        }
        List<VideoSectionResponse> sections = Collections.emptyList();
        if (video.getId() != null) {
            sections = videoSectionRepository.findByVideo(video).stream()
                    .sorted(Comparator.comparingInt(VideoSection::getStartSec))
                    .map(section -> new VideoSectionResponse(section.getTitle(),
                            section.getStartSec(),
                            section.getEndSec(),
                            section.getSource().name()))
                    .collect(Collectors.toList());
        }
        return new VideoResponse(
                video.getId(),
                video.getArtist() != null ? video.getArtist().getId() : null,
                video.getYoutubeVideoId(),
                video.getTitle(),
                video.getDurationSec(),
                video.getThumbnailUrl(),
                video.getChannelId(),
                video.getOriginalComposer(),
                sections
        );
    }

    private ClipResponse mapClip(Clip clip) {
        if (clip == null) {
            return null;
        }
        return new ClipResponse(
                clip.getId(),
                clip.getVideo() != null ? clip.getVideo().getId() : null,
                clip.getTitle(),
                clip.getStartSec(),
                clip.getEndSec(),
                clip.getTags(),
                clip.getOriginalComposer()
        );
    }
}
