package com.example.youtube.service;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

@Service
public class ChzzkApiService {

    private static final Logger log = LoggerFactory.getLogger(ChzzkApiService.class);
    private static final String BASE_URL = "https://openapi.chzzk.naver.com";

    private final RestClient restClient;
    private final String clientId;
    private final String clientSecret;

    public ChzzkApiService(RestClient.Builder restClientBuilder,
                           @Value("${chzzk.api.client-id:}") String clientId,
                           @Value("${chzzk.api.client-secret:}") String clientSecret) {
        this.restClient = restClientBuilder.baseUrl(BASE_URL).build();
        this.clientId = clientId == null ? "" : clientId.trim();
        this.clientSecret = clientSecret == null ? "" : clientSecret.trim();
    }

    public Optional<LiveInfo> fetchLiveStatus(String chzzkChannelId) {
        if (!hasText(chzzkChannelId)) {
            return Optional.empty();
        }
        if (!hasText(clientId) || !hasText(clientSecret)) {
            log.warn("Chzzk API credentials are not configured; skipping live status lookup.");
            return Optional.empty();
        }

        String trimmedChannelId = chzzkChannelId.trim();

        return fetchFromChannelApi(trimmedChannelId)
                .or(() -> fetchFromLiveList(trimmedChannelId));
    }

    private Optional<LiveInfo> fetchFromChannelApi(String channelId) {
        try {
            Map<String, Object> response = restClient.get()
                    .uri(uriBuilder -> uriBuilder
                            .path("/open/v1/channels")
                            .queryParam("channelIds", channelId)
                            .build())
                    .header("Client-Id", clientId)
                    .header("Client-Secret", clientSecret)
                    .accept(MediaType.APPLICATION_JSON)
                    .retrieve()
                    .body(Map.class);

            return parseChannelResponse(response, channelId);
        } catch (Exception ex) {
            log.warn("Failed to fetch Chzzk channel {}: {}", channelId, ex.getMessage());
            return Optional.empty();
        }
    }

    private Optional<LiveInfo> parseChannelResponse(Map<String, Object> response, String channelId) {
        Map<String, Object> content = asMap(response == null ? null : response.get("content"));
        List<?> data = content == null ? null : asList(content.get("data"));
        if (data == null || data.isEmpty()) {
            return Optional.empty();
        }

        for (Object entry : data) {
            Map<String, Object> channel = asMap(entry);
            if (channel == null) {
                continue;
            }
            String currentChannelId = stringValue(channel.get("channelId"));
            if (!channelId.equals(currentChannelId)) {
                continue;
            }

            Boolean openLive = booleanValue(channel.get("openLive"));
            if (!Boolean.TRUE.equals(openLive)) {
                continue;
            }

            Map<String, Object> liveInfo = asMap(channel.get("liveInfo"));
            String title = liveInfo == null ? null : stringValue(liveInfo.get("liveTitle"));
            String thumbnail = liveInfo == null ? null : stringValue(liveInfo.get("liveImageUrl"));
            String viewerCount = liveInfo == null ? null : stringValue(liveInfo.get("concurrentUserCount"));
            return Optional.of(new LiveInfo(channelId, title, thumbnail, viewerCount));
        }

        return Optional.empty();
    }

    private Optional<LiveInfo> fetchFromLiveList(String targetChannelId) {
        try {
            Map<String, Object> response = restClient.get()
                    .uri(uriBuilder -> uriBuilder
                            .path("/open/v1/lives")
                            .queryParam("size", 50)
                            .queryParam("sort", "CONCURRENT_USER_COUNT")
                            .build())
                    .header("Client-Id", clientId)
                    .header("Client-Secret", clientSecret)
                    .accept(MediaType.APPLICATION_JSON)
                    .retrieve()
                    .body(Map.class);

            Map<String, Object> content = asMap(response == null ? null : response.get("content"));
            List<?> data = content == null ? null : asList(content.get("data"));
            if (data == null) {
                return Optional.empty();
            }

            for (Object entry : data) {
                Map<String, Object> live = asMap(entry);
                if (live == null) {
                    continue;
                }
                String channelId = stringValue(live.get("channelId"));
                if (!targetChannelId.equals(channelId)) {
                    continue;
                }
                String title = stringValue(live.get("liveTitle"));
                String thumbnail = stringValue(live.get("liveImageUrl"));
                String viewerCount = stringValue(live.get("concurrentUserCount"));
                return Optional.of(new LiveInfo(channelId, title, thumbnail, viewerCount));
            }
        } catch (Exception ex) {
            log.warn("Failed to fetch Chzzk live list: {}", ex.getMessage());
        }
        return Optional.empty();
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private Map<String, Object> asMap(Object value) {
        if (value instanceof Map<?, ?> map) {
            @SuppressWarnings("unchecked")
            Map<String, Object> typed = (Map<String, Object>) map;
            return typed;
        }
        return null;
    }

    private List<?> asList(Object value) {
        if (value instanceof List<?> list) {
            return list;
        }
        return null;
    }

    private String stringValue(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private Boolean booleanValue(Object value) {
        if (value instanceof Boolean booleanValue) {
            return booleanValue;
        }
        return value == null ? null : Boolean.valueOf(String.valueOf(value));
    }

    public record LiveInfo(String channelId, String title, String thumbnailUrl, String viewerCount) {
    }
}
