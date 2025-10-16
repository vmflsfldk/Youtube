package com.example.youtube.service;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class YouTubeApiChannelMetadataProvider implements YouTubeChannelMetadataProvider {

    private static final Logger log = LoggerFactory.getLogger(YouTubeApiChannelMetadataProvider.class);

    private final RestClient restClient;
    private final String apiKey;

    public YouTubeApiChannelMetadataProvider(RestClient.Builder restClientBuilder,
                                             @Value("${app.youtube.api-key:}") String apiKey) {
        this.restClient = restClientBuilder
                .baseUrl("https://www.googleapis.com/youtube/v3")
                .build();
        this.apiKey = apiKey == null ? "" : apiKey.trim();
    }

    @Override
    public ChannelMetadata fetch(String channelId) {
        if (channelId == null || channelId.isBlank()) {
            return ChannelMetadata.empty();
        }

        if (apiKey.isBlank()) {
            log.warn("YouTube API key is not configured; skipping metadata fetch.");
            return ChannelMetadata.empty();
        }

        try {
            String trimmedChannelId = channelId.trim();
            ChannelsResponse response = restClient.get()
                    .uri(uriBuilder -> uriBuilder
                            .path("/channels")
                            .queryParam("part", "snippet")
                            .queryParam("id", trimmedChannelId)
                            .queryParam("key", apiKey)
                            .build())
                    .retrieve()
                    .body(ChannelsResponse.class);

            if (response == null || response.items() == null || response.items().isEmpty()) {
                return ChannelMetadata.empty();
            }

            ChannelItem firstItem = response.items().get(0);
            if (firstItem == null) {
                return ChannelMetadata.empty();
            }

            Snippet snippet = firstItem.snippet();
            if (snippet == null) {
                return ChannelMetadata.empty();
            }

            String thumbnailUrl = resolveThumbnailUrl(snippet.thumbnails());
            return new ChannelMetadata(snippet.title(), thumbnailUrl);
        } catch (Exception ex) {
            log.warn("Failed to fetch channel metadata for {}: {}", channelId, ex.getMessage());
            return ChannelMetadata.empty();
        }
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
            String url = candidate.url();
            if (url != null && !url.isBlank()) {
                return url;
            }
        }
        return null;
    }

    private record ChannelsResponse(List<ChannelItem> items) {
    }

    private record ChannelItem(Snippet snippet) {
    }

    private record Snippet(String title, Thumbnails thumbnails) {
    }

    private record Thumbnails(
            @JsonProperty("default") ThumbnailInfo defaultThumbnail,
            ThumbnailInfo medium,
            ThumbnailInfo high,
            ThumbnailInfo standard,
            ThumbnailInfo maxres
    ) {
    }

    private record ThumbnailInfo(String url) {
    }
}
