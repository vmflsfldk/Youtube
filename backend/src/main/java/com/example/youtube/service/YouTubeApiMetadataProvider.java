package com.example.youtube.service;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class YouTubeApiMetadataProvider implements YouTubeMetadataProvider {

    private static final Logger log = LoggerFactory.getLogger(YouTubeApiMetadataProvider.class);
    private static final Pattern ISO_8601_DURATION = Pattern.compile(
            "PT(?:(\\d+)H)?(?:(\\d+)M)?(?:(\\d+)S)?",
            Pattern.CASE_INSENSITIVE);

    private final RestClient restClient;
    private final String apiKey;

    public YouTubeApiMetadataProvider(RestClient.Builder restClientBuilder,
                                      @Value("${app.youtube.api-key:}") String apiKey) {
        this.restClient = restClientBuilder
                .baseUrl("https://www.googleapis.com/youtube/v3")
                .build();
        this.apiKey = apiKey == null ? "" : apiKey.trim();
    }

    @Override
    public VideoMetadata fetch(String videoId) {
        if (videoId == null || videoId.isBlank()) {
            return new VideoMetadata(null, null, null, null, null);
        }

        if (apiKey.isBlank()) {
            log.warn("YouTube API key is not configured; returning minimal metadata for video {}.", videoId);
            return new VideoMetadata(null, null, null, null, null);
        }

        try {
            VideosResponse response = restClient.get()
                    .uri(uriBuilder -> uriBuilder
                            .path("/videos")
                            .queryParam("part", "snippet,contentDetails")
                            .queryParam("id", videoId)
                            .queryParam("key", apiKey)
                            .build())
                    .retrieve()
                    .body(VideosResponse.class);

            if (response == null || response.items() == null || response.items().isEmpty()) {
                return new VideoMetadata(null, null, null, null, null);
            }

            VideoItem item = response.items().get(0);
            if (item == null) {
                return new VideoMetadata(null, null, null, null, null);
            }

            Snippet snippet = item.snippet();
            ContentDetails contentDetails = item.contentDetails();

            String title = snippet != null ? sanitize(snippet.title()) : null;
            String thumbnailUrl = snippet != null ? resolveThumbnailUrl(snippet.thumbnails()) : null;
            String channelId = snippet != null ? snippet.channelId() : null;
            String description = snippet != null ? snippet.description() : null;
            Integer durationSec = contentDetails != null ? parseDuration(contentDetails.duration()) : null;

            return new VideoMetadata(title, durationSec, thumbnailUrl, channelId, description);
        } catch (Exception ex) {
            log.warn("Failed to fetch video metadata for {}: {}", videoId, ex.getMessage());
            return new VideoMetadata(null, null, null, null, null);
        }
    }

    private Integer parseDuration(String duration) {
        if (duration == null || duration.isBlank()) {
            return null;
        }
        Matcher matcher = ISO_8601_DURATION.matcher(duration.trim());
        if (!matcher.matches()) {
            return null;
        }
        int hours = parseInt(matcher.group(1));
        int minutes = parseInt(matcher.group(2));
        int seconds = parseInt(matcher.group(3));
        int total = hours * 3600 + minutes * 60 + seconds;
        return total > 0 ? total : null;
    }

    private int parseInt(String value) {
        if (value == null || value.isBlank()) {
            return 0;
        }
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException ex) {
            return 0;
        }
    }

    private String sanitize(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private String resolveThumbnailUrl(Thumbnails thumbnails) {
        if (thumbnails == null) {
            return null;
        }
        ThumbnailInfo[] candidates = new ThumbnailInfo[] {
                thumbnails.maxres(),
                thumbnails.standard(),
                thumbnails.high(),
                thumbnails.medium(),
                thumbnails.defaultThumbnail()
        };
        for (ThumbnailInfo candidate : candidates) {
            if (candidate == null) {
                continue;
            }
            String url = sanitize(candidate.url());
            if (url != null) {
                return url;
            }
        }
        return null;
    }

    private record VideosResponse(List<VideoItem> items) {
    }

    private record VideoItem(Snippet snippet, ContentDetails contentDetails) {
    }

    private record Snippet(String title,
                            String description,
                            String channelId,
                            Thumbnails thumbnails) {
    }

    private record ContentDetails(String duration) {
    }

    private record Thumbnails(
            @JsonProperty("default") ThumbnailInfo defaultThumbnail,
            ThumbnailInfo medium,
            ThumbnailInfo high,
            ThumbnailInfo standard,
            ThumbnailInfo maxres) {
    }

    private record ThumbnailInfo(String url) {
    }
}
