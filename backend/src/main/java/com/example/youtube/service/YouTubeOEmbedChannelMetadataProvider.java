package com.example.youtube.service;

import com.fasterxml.jackson.annotation.JsonProperty;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class YouTubeOEmbedChannelMetadataProvider implements YouTubeChannelMetadataProvider {

    private static final Logger log = LoggerFactory.getLogger(YouTubeOEmbedChannelMetadataProvider.class);

    private final RestClient restClient;

    public YouTubeOEmbedChannelMetadataProvider(RestClient.Builder restClientBuilder) {
        this.restClient = restClientBuilder
                .baseUrl("https://www.youtube.com")
                .build();
    }

    @Override
    public ChannelMetadata fetch(String channelId) {
        if (channelId == null || channelId.isBlank()) {
            return ChannelMetadata.empty();
        }

        try {
            String trimmedChannelId = channelId.trim();
            OEmbedResponse response = restClient.get()
                    .uri(uriBuilder -> uriBuilder
                            .path("/oembed")
                            .queryParam("url", "https://www.youtube.com/channel/" + trimmedChannelId)
                            .queryParam("format", "json")
                            .build())
                    .retrieve()
                    .body(OEmbedResponse.class);

            if (response == null) {
                return ChannelMetadata.empty();
            }

            return new ChannelMetadata(response.title(), response.thumbnailUrl());
        } catch (Exception ex) {
            log.warn("Failed to fetch channel metadata for {}: {}", channelId, ex.getMessage());
            return ChannelMetadata.empty();
        }
    }

    private record OEmbedResponse(
            @JsonProperty("title") String title,
            @JsonProperty("thumbnail_url") String thumbnailUrl
    ) {
    }
}
