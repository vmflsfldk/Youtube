package com.example.youtube.service;

import com.example.youtube.dto.ClipCreateRequest;
import com.example.youtube.dto.ClipResponse;
import com.example.youtube.dto.ClipUpdateRequest;
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
        Video video = videoRepository.findById(request.videoId())
                .orElseThrow(() -> new EntityNotFoundException("Video not found: " + request.videoId()));

        if (request.endSec() <= request.startSec()) {
            throw new IllegalArgumentException("endSec must be greater than startSec");
        }

        if (clipRepository.existsByVideoAndStartSecAndEndSec(video, request.startSec(), request.endSec())) {
            throw new IllegalArgumentException("A clip with the same time range already exists for this video");
        }

        Clip clip = new Clip(video, request.title(), request.startSec(), request.endSec());
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

    @Transactional
    public ClipResponse update(Long clipId, ClipUpdateRequest request) {
        Clip clip = clipRepository.findById(clipId)
                .orElseThrow(() -> new EntityNotFoundException("Clip not found: " + clipId));

        Video video = clip.getVideo();
        Artist artist = video.getArtist();
        if (artist == null) {
            throw new EntityNotFoundException("Artist not found for clip: " + clipId);
        }

        int startSec = request.startSec();
        int endSec = request.endSec();

        if (endSec <= startSec) {
            throw new IllegalArgumentException("endSec must be greater than startSec");
        }

        if (clipRepository.existsByVideoAndStartSecAndEndSecAndIdNot(video, startSec, endSec, clipId)) {
            throw new IllegalArgumentException("A clip with the same time range already exists for this video");
        }

        clip.setStartSec(startSec);
        clip.setEndSec(endSec);

        Clip saved = clipRepository.save(clip);
        return map(saved);
    }

    private ClipResponse map(Clip clip) {
        return new ClipResponse(clip.getId(),
                clip.getVideo().getId(),
                clip.getTitle(),
                clip.getStartSec(),
                clip.getEndSec(),
                clip.getTags());
    }
}
