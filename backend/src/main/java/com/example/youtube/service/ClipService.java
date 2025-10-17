package com.example.youtube.service;

import com.example.youtube.dto.ClipCreateRequest;
import com.example.youtube.dto.ClipResponse;
import com.example.youtube.model.Artist;
import com.example.youtube.model.Clip;
import com.example.youtube.model.Video;
import com.example.youtube.repository.ArtistRepository;
import com.example.youtube.repository.ClipRepository;
import com.example.youtube.repository.VideoRepository;
import jakarta.persistence.EntityNotFoundException;
import java.util.List;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ClipService {

    private final ClipRepository clipRepository;
    private final VideoRepository videoRepository;
    private final ArtistRepository artistRepository;

    public ClipService(ClipRepository clipRepository,
                       VideoRepository videoRepository,
                       ArtistRepository artistRepository) {
        this.clipRepository = clipRepository;
        this.videoRepository = videoRepository;
        this.artistRepository = artistRepository;
    }

    @Transactional
    public ClipResponse create(ClipCreateRequest request) {
        Video video = null;
        if (request.videoId() != null) {
            video = videoRepository.findById(request.videoId())
                    .orElseThrow(() -> new EntityNotFoundException("Video not found: " + request.videoId()));
        }

        Artist artist = null;
        if (video != null) {
            artist = video.getArtist();
        } else if (request.artistId() != null) {
            artist = artistRepository.findById(request.artistId())
                    .orElseThrow(() -> new EntityNotFoundException("Artist not found: " + request.artistId()));
        }

        if (artist == null) {
            throw new IllegalArgumentException("artistId must be provided when videoId is not supplied");
        }

        String youtubeVideoId = video != null ? video.getYoutubeVideoId() : request.youtubeVideoId();
        if (youtubeVideoId == null || youtubeVideoId.isBlank()) {
            throw new IllegalArgumentException("youtubeVideoId must be provided when videoId is not supplied");
        }

        if (request.endSec() <= request.startSec()) {
            throw new IllegalArgumentException("endSec must be greater than startSec");
        }

        Clip clip = new Clip(video, artist, youtubeVideoId, request.title(), request.startSec(), request.endSec());
        if (request.tags() != null) {
            clip.setTags(request.tags());
        }
        Clip saved = clipRepository.save(clip);
        return map(saved);
    }

    @Transactional(readOnly = true)
    public List<ClipResponse> listByArtist(Long artistId) {
        Artist artist = artistRepository.findById(artistId)
                .orElseThrow(() -> new EntityNotFoundException("Artist not found: " + artistId));
        return clipRepository.findByArtist(artist).stream()
                .map(this::map)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<ClipResponse> listByVideo(Long videoId) {
        Video video = videoRepository.findById(videoId)
                .orElseThrow(() -> new EntityNotFoundException("Video not found: " + videoId));
        return clipRepository.findByVideo(video).stream()
                .map(this::map)
                .collect(Collectors.toList());
    }

    private ClipResponse map(Clip clip) {
        return new ClipResponse(clip.getId(),
                clip.getVideo() != null ? clip.getVideo().getId() : null,
                clip.getYoutubeVideoId(),
                clip.getTitle(),
                clip.getStartSec(),
                clip.getEndSec(),
                clip.getTags());
    }
}
