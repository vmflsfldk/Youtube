package com.example.youtube.service;

import com.example.youtube.dto.VideoCreateRequest;
import com.example.youtube.dto.VideoResponse;
import com.example.youtube.model.Artist;
import com.example.youtube.model.Video;
import com.example.youtube.repository.ArtistRepository;
import com.example.youtube.repository.VideoRepository;
import jakarta.persistence.EntityNotFoundException;
import jakarta.validation.ValidationException;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class VideoService {

    private static final Pattern VIDEO_ID_PATTERN = Pattern.compile("[?&]v=([a-zA-Z0-9_-]{11})");

    private final ArtistRepository artistRepository;
    private final VideoRepository videoRepository;
    private final YouTubeMetadataProvider metadataProvider;

    public VideoService(ArtistRepository artistRepository,
                        VideoRepository videoRepository,
                        YouTubeMetadataProvider metadataProvider) {
        this.artistRepository = artistRepository;
        this.videoRepository = videoRepository;
        this.metadataProvider = metadataProvider;
    }

    @Transactional
    public VideoResponse create(VideoCreateRequest request) {
        String videoId = extractVideoId(request.videoUrl())
                .orElseThrow(() -> new ValidationException("Unable to parse videoId from URL"));
        Artist artist = artistRepository.findById(request.artistId())
                .orElseThrow(() -> new EntityNotFoundException("Artist not found: " + request.artistId()));

        Video video = videoRepository.findByYoutubeVideoId(videoId)
                .orElseGet(() -> new Video(artist, videoId, ""));
        video.setArtist(artist);

        VideoMetadata metadata = metadataProvider.fetch(videoId);
        video.setTitle(Optional.ofNullable(metadata.title()).orElse("Untitled"));
        video.setDurationSec(metadata.durationSec());
        video.setThumbnailUrl(metadata.thumbnailUrl());
        video.setChannelId(metadata.channelId());
        video.setDescription(request.description());
        video.setCaptionsJson(request.captionsJson());

        Video saved = videoRepository.save(video);
        return map(saved);
    }

    @Transactional(readOnly = true)
    public Video getVideo(Long id) {
        return videoRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Video not found: " + id));
    }

    @Transactional(readOnly = true)
    public java.util.List<VideoResponse> listByArtist(Long artistId) {
        Artist artist = artistRepository.findById(artistId)
                .orElseThrow(() -> new EntityNotFoundException("Artist not found: " + artistId));
        return videoRepository.findByArtist(artist).stream()
                .map(this::map)
                .collect(Collectors.toList());
    }

    private VideoResponse map(Video video) {
        return new VideoResponse(video.getId(),
                video.getArtist().getId(),
                video.getYoutubeVideoId(),
                video.getTitle(),
                video.getDurationSec(),
                video.getThumbnailUrl(),
                video.getChannelId());
    }

    private Optional<String> extractVideoId(String url) {
        if (url == null || url.isBlank()) {
            return Optional.empty();
        }
        Matcher matcher = VIDEO_ID_PATTERN.matcher(url);
        if (matcher.find()) {
            return Optional.ofNullable(matcher.group(1));
        }
        try {
            URI uri = new URI(url);
            String path = uri.getPath();
            if (path != null) {
                String[] segments = path.split("/");
                String last = segments[segments.length - 1];
                if (last.length() == 11) {
                    return Optional.of(last);
                }
            }
        } catch (URISyntaxException ignored) {
        }
        return Optional.empty();
    }
}
