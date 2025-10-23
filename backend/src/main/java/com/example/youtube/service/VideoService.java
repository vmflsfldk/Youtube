package com.example.youtube.service;

import com.example.youtube.dto.ClipCandidateResponse;
import com.example.youtube.dto.LocalizedTextRequest;
import com.example.youtube.dto.LocalizedTextResponse;
import com.example.youtube.dto.VideoCategoryUpdateRequest;
import com.example.youtube.dto.VideoClipSuggestionsRequest;
import com.example.youtube.dto.VideoClipSuggestionsResponse;
import com.example.youtube.dto.VideoCreateRequest;
import com.example.youtube.dto.VideoResponse;
import com.example.youtube.dto.VideoSectionResponse;
import com.example.youtube.model.Artist;
import com.example.youtube.model.ComposerName;
import com.example.youtube.model.SongTitle;
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
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.springframework.beans.factory.ObjectProvider;
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
    private final ObjectProvider<ClipAutoDetectionService> clipAutoDetectionServiceProvider;

    public VideoService(ArtistRepository artistRepository,
                        VideoRepository videoRepository,
                        VideoSectionRepository videoSectionRepository,
                        YouTubeMetadataProvider metadataProvider,
                        YouTubeVideoSectionProvider sectionProvider,
                        ObjectProvider<ClipAutoDetectionService> clipAutoDetectionServiceProvider) {
        this.artistRepository = artistRepository;
        this.videoRepository = videoRepository;
        this.videoSectionRepository = videoSectionRepository;
        this.metadataProvider = metadataProvider;
        this.sectionProvider = sectionProvider;
        this.clipAutoDetectionServiceProvider = clipAutoDetectionServiceProvider;
    }

    @Transactional
    public VideoClipSuggestionsResponse registerAndSuggest(VideoClipSuggestionsRequest request) {
        String videoId = extractVideoId(request.videoUrl())
                .orElseThrow(() -> new ValidationException("Unable to parse videoId from URL"));

        List<LocalizedTextRequest> composers = normalizeComposerRequest(request.originalComposer());
        VideoCreateRequest createRequest = new VideoCreateRequest(
                request.videoUrl(),
                request.artistId(),
                null,
                null,
                request.category(),
                null,
                composers);

        boolean created = false;
        VideoResponse videoResponse;
        try {
            videoResponse = create(createRequest);
            created = true;
        } catch (ResponseStatusException ex) {
            if (!HttpStatus.CONFLICT.equals(ex.getStatusCode())) {
                throw ex;
            }
            Video existing = videoRepository.findByYoutubeVideoId(videoId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                            "Video exists but could not be loaded: " + videoId));
            videoResponse = map(existing);
        }

        List<ClipCandidateResponse> candidates = clipAutoDetectionServiceProvider.getObject()
                .detect(videoResponse.id(), "combined");

        return new VideoClipSuggestionsResponse(
                videoResponse,
                candidates,
                created ? "created" : "existing",
                created ? null : "Video already registered",
                created,
                created ? Boolean.FALSE : Boolean.TRUE);
    }

    @Transactional
    public VideoResponse create(VideoCreateRequest request) {
        String videoId = extractVideoId(request.videoUrl())
                .orElseThrow(() -> new ValidationException("Unable to parse videoId from URL"));
        Artist artist = artistRepository.findById(request.artistId())
                .orElseThrow(() -> new EntityNotFoundException("Artist not found: " + request.artistId()));

        videoRepository.findByYoutubeVideoId(videoId)
                .ifPresent(existing -> {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "Video already registered: " + videoId);
                });

        Video video = new Video(artist, videoId, "");

        VideoMetadata metadata = metadataProvider.fetch(videoId);
        List<LocalizedTextRequest> titleRequests = request.titles();
        if ((titleRequests == null || titleRequests.isEmpty()) && metadata.title() != null
                && !metadata.title().isBlank()) {
            titleRequests = List.of(new LocalizedTextRequest("und", metadata.title()));
        }
        video.setTitles(toVideoSongTitles(video, titleRequests));
        if (!video.getTitles().isEmpty()) {
            video.setTitle(video.getTitles().get(0).getValue());
        } else {
            video.setTitle(Optional.ofNullable(metadata.title()).orElse("Untitled"));
        }
        video.setDurationSec(metadata.durationSec());
        video.setThumbnailUrl(metadata.thumbnailUrl());
        video.setChannelId(metadata.channelId());
        String description = request.description();
        if ((description == null || description.isBlank()) && metadata.description() != null) {
            description = metadata.description();
        }
        video.setDescription(description);
        video.setCaptionsJson(request.captionsJson());
        List<LocalizedTextRequest> composerRequests = request.originalComposers();
        video.setComposerNames(toVideoComposerNames(video, composerRequests));
        if (!video.getComposerNames().isEmpty()) {
            video.setOriginalComposer(video.getComposerNames().get(0).getValue());
        } else {
            video.setOriginalComposer(null);
        }

        String resolvedCategory = resolveCategory(request.category(), video.getTitle());
        video.setCategory(resolvedCategory);

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
                video.getCategory(),
                video.getOriginalComposer(),
                mapSongTitles(video.getTitles()),
                mapComposerNames(video.getComposerNames()),
                sectionResponses);
    }

    @Transactional
    public VideoResponse updateCategory(Long videoId, VideoCategoryUpdateRequest request) {
        Video video = getVideo(videoId);
        String resolvedCategory = resolveCategory(request.category(), video.getTitle());
        video.setCategory(resolvedCategory);
        Video saved = videoRepository.save(video);
        return map(saved);
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

    private List<SongTitle> toVideoSongTitles(Video video, List<LocalizedTextRequest> titles) {
        if (titles == null) {
            return List.of();
        }
        return titles.stream()
                .filter(title -> title != null && title.value() != null && !title.value().isBlank())
                .map(title -> new SongTitle(video, null, normalizeLanguageCode(title.languageCode()), title.value().trim()))
                .collect(Collectors.toList());
    }

    private List<ComposerName> toVideoComposerNames(Video video, List<LocalizedTextRequest> composers) {
        if (composers == null) {
            return List.of();
        }
        return composers.stream()
                .filter(composer -> composer != null && composer.value() != null && !composer.value().isBlank())
                .map(composer -> new ComposerName(video, null,
                        normalizeLanguageCode(composer.languageCode()), composer.value().trim()))
                .collect(Collectors.toList());
    }

    private List<LocalizedTextRequest> normalizeComposerRequest(String originalComposer) {
        if (originalComposer == null || originalComposer.isBlank()) {
            return null;
        }
        return List.of(new LocalizedTextRequest("und", originalComposer.trim()));
    }

    private List<LocalizedTextResponse> mapSongTitles(List<SongTitle> titles) {
        if (titles == null || titles.isEmpty()) {
            return List.of();
        }
        return titles.stream()
                .map(title -> new LocalizedTextResponse(title.getLanguageCode(), title.getValue(), title.getNormalizedValue()))
                .collect(Collectors.toList());
    }

    private List<LocalizedTextResponse> mapComposerNames(List<ComposerName> composers) {
        if (composers == null || composers.isEmpty()) {
            return List.of();
        }
        return composers.stream()
                .map(composer -> new LocalizedTextResponse(composer.getLanguageCode(),
                        composer.getValue(),
                        composer.getNormalizedValue()))
                .collect(Collectors.toList());
    }

    private String normalizeLanguageCode(String languageCode) {
        if (languageCode == null) {
            return "und";
        }
        String trimmed = languageCode.trim();
        if (trimmed.isEmpty()) {
            return "und";
        }
        return trimmed.toLowerCase(Locale.ROOT);
    }

    private String resolveCategory(String requestedCategory, String titleForDerivation) {
        String normalized = normalizeCategory(requestedCategory);
        if (normalized != null) {
            return normalized;
        }
        return deriveCategoryFromTitle(titleForDerivation);
    }

    private String normalizeCategory(String category) {
        if (category == null) {
            return null;
        }
        String trimmed = category.trim();
        if (trimmed.isEmpty()) {
            return null;
        }
        String lower = trimmed.toLowerCase(Locale.ROOT);
        if ("live".equals(lower) || "cover".equals(lower) || "original".equals(lower)) {
            return lower;
        }
        return trimmed;
    }

    private String deriveCategoryFromTitle(String title) {
        if (title == null) {
            return null;
        }
        String normalized = title.toLowerCase(Locale.ROOT);
        if (normalized.contains("歌枠") || normalized.contains("live")) {
            return "live";
        }
        if (normalized.contains("cover")) {
            return "cover";
        }
        if (normalized.contains("original")) {
            return "original";
        }
        return null;
    }
}
