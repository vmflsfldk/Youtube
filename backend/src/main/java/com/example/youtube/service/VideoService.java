package com.example.youtube.service;

import com.example.youtube.dto.VideoCreateRequest;
import com.example.youtube.dto.VideoResponse;
import com.example.youtube.dto.VideoSectionResponse;
import com.example.youtube.model.Artist;
import com.example.youtube.model.Video;
import com.example.youtube.model.VideoSection;
import com.example.youtube.repository.ArtistRepository;
import com.example.youtube.repository.VideoRepository;
import com.example.youtube.repository.VideoSectionRepository;
import jakarta.persistence.EntityNotFoundException;
import jakarta.validation.ValidationException;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class VideoService {

    private static final Pattern VIDEO_ID_PATTERN = Pattern.compile("[?&]v=([a-zA-Z0-9_-]{11})");

    private final ArtistRepository artistRepository;
    private final VideoRepository videoRepository;
    private final VideoSectionRepository videoSectionRepository;
    private final YouTubeMetadataProvider metadataProvider;
    private final YouTubeVideoSectionProvider sectionProvider;

    public VideoService(ArtistRepository artistRepository,
                        VideoRepository videoRepository,
                        VideoSectionRepository videoSectionRepository,
                        YouTubeMetadataProvider metadataProvider,
                        YouTubeVideoSectionProvider sectionProvider) {
        this.artistRepository = artistRepository;
        this.videoRepository = videoRepository;
        this.videoSectionRepository = videoSectionRepository;
        this.metadataProvider = metadataProvider;
        this.sectionProvider = sectionProvider;
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
        String description = request.description();
        if ((description == null || description.isBlank()) && metadata.description() != null) {
            description = metadata.description();
        }
        video.setDescription(description);
        video.setCaptionsJson(request.captionsJson());

        List<YouTubeVideoSectionProvider.VideoSectionData> sectionData = sectionProvider.fetch(videoId, description,
                metadata.durationSec());

        Video saved = videoRepository.save(video);

        videoSectionRepository.deleteByVideo(saved);
        List<VideoSection> sections = sectionData.stream()
                .map(data -> new VideoSection(saved, data.title(), data.startSec(), data.endSec(), data.source()))
                .collect(Collectors.toList());
        if (!sections.isEmpty()) {
            videoSectionRepository.saveAll(sections);
        }

        return map(saved, sections);
    }

    @Transactional(readOnly = true)
    public Video getVideo(Long id) {
        return videoRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Video not found: " + id));
    }

    @Transactional(readOnly = true)
    public List<VideoResponse> listByArtist(Long artistId) {
        Artist artist = artistRepository.findById(artistId)
                .orElseThrow(() -> new EntityNotFoundException("Artist not found: " + artistId));
        List<Video> videos = videoRepository.findByArtist(artist);
        if (videos.isEmpty()) {
            return List.of();
        }
        Map<Long, List<VideoSection>> sectionsByVideo = videoSectionRepository.findByVideoIn(videos).stream()
                .collect(Collectors.groupingBy(section -> section.getVideo().getId()));
        return videos.stream()
                .map(video -> map(video, sectionsByVideo.getOrDefault(video.getId(), Collections.emptyList())))
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<VideoSectionResponse> previewSections(String videoUrl) {
        if (videoUrl == null || videoUrl.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "videoUrl is required");
        }
        String trimmed = videoUrl.trim();
        String videoId = extractVideoId(trimmed)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unable to parse videoId from URL"));

        VideoMetadata metadata = metadataProvider.fetch(videoId);
        List<YouTubeVideoSectionProvider.VideoSectionData> sectionData = sectionProvider.fetch(videoId,
                metadata.description(),
                metadata.durationSec());
        return mapSectionData(sectionData);
    }

    private VideoResponse map(Video video) {
        List<VideoSection> sections = videoSectionRepository.findByVideo(video);
        return map(video, sections);
    }

    private VideoResponse map(Video video, List<VideoSection> sections) {
        List<VideoSectionResponse> sectionResponses = sections.stream()
                .sorted(Comparator.comparingInt(VideoSection::getStartSec))
                .map(section -> new VideoSectionResponse(section.getTitle(),
                        section.getStartSec(),
                        section.getEndSec(),
                        section.getSource().name()))
                .collect(Collectors.toList());

        return new VideoResponse(video.getId(),
                video.getArtist().getId(),
                video.getYoutubeVideoId(),
                video.getTitle(),
                video.getDurationSec(),
                video.getThumbnailUrl(),
                video.getChannelId(),
                sectionResponses);
    }

    private List<VideoSectionResponse> mapSectionData(List<YouTubeVideoSectionProvider.VideoSectionData> sectionData) {
        if (sectionData == null || sectionData.isEmpty()) {
            return List.of();
        }
        return sectionData.stream()
                .sorted(Comparator.comparingInt(YouTubeVideoSectionProvider.VideoSectionData::startSec))
                .map(data -> new VideoSectionResponse(data.title(), data.startSec(), data.endSec(), data.source().name()))
                .collect(Collectors.toList());
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
