package com.example.youtube.service;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.Arrays;
import java.util.List;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class YouTubeApiChannelMetadataProvider implements YouTubeChannelMetadataProvider {

    private static final Logger log = LoggerFactory.getLogger(YouTubeApiChannelMetadataProvider.class);
    private static final Pattern CHANNEL_ID_PATTERN = Pattern.compile("^UC[0-9A-Za-z_-]{22}$");
    private static final String[] YOUTUBE_HOST_SUFFIXES = {"youtube.com", "youtu.be"};

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
            ChannelIdentifier identifier = parseChannelIdentifier(trimmedChannelId);

            String effectiveChannelId = identifier.channelId();
            Snippet searchSnippet = null;

            if (effectiveChannelId == null && identifier.handle() != null) {
                SearchResult searchResult = searchChannelByHandle(identifier.handle());
                if (searchResult != null) {
                    effectiveChannelId = searchResult.channelId();
                    searchSnippet = searchResult.snippet();
                }
            }

            ChannelsResponse response = null;
            if (hasText(effectiveChannelId)) {
                String channelIdParam = effectiveChannelId;
                response = restClient.get()
                        .uri(uriBuilder -> uriBuilder
                                .path("/channels")
                                .queryParam("part", "snippet")
                                .queryParam("id", channelIdParam)
                                .queryParam("key", apiKey)
                                .build())
                        .retrieve()
                        .body(ChannelsResponse.class);
            } else if (hasText(identifier.username())) {
                String usernameParam = identifier.username();
                response = restClient.get()
                        .uri(uriBuilder -> uriBuilder
                                .path("/channels")
                                .queryParam("part", "snippet")
                                .queryParam("forUsername", usernameParam)
                                .queryParam("key", apiKey)
                                .build())
                        .retrieve()
                        .body(ChannelsResponse.class);
            } else if (CHANNEL_ID_PATTERN.matcher(trimmedChannelId).matches()) {
                String channelIdParam = trimmedChannelId;
                response = restClient.get()
                        .uri(uriBuilder -> uriBuilder
                                .path("/channels")
                                .queryParam("part", "snippet")
                                .queryParam("id", channelIdParam)
                                .queryParam("key", apiKey)
                                .build())
                        .retrieve()
                        .body(ChannelsResponse.class);
            }

            if (response == null || response.items() == null || response.items().isEmpty()) {
                if (searchSnippet != null) {
                    String title = sanitizeTitle(searchSnippet.title());
                    String thumbnailUrl = resolveThumbnailUrl(searchSnippet.thumbnails());
                    if (title != null || thumbnailUrl != null) {
                        return new ChannelMetadata(title, thumbnailUrl);
                    }
                }
                return ChannelMetadata.empty();
            }

            ChannelItem firstItem = response.items().get(0);
            if (firstItem == null) {
                if (searchSnippet != null) {
                    String title = sanitizeTitle(searchSnippet.title());
                    String thumbnailUrl = resolveThumbnailUrl(searchSnippet.thumbnails());
                    if (title != null || thumbnailUrl != null) {
                        return new ChannelMetadata(title, thumbnailUrl);
                    }
                }
                return ChannelMetadata.empty();
            }

            Snippet snippet = firstItem.snippet();
            if (snippet == null && searchSnippet != null) {
                snippet = searchSnippet;
            }
            if (snippet == null) {
                return ChannelMetadata.empty();
            }

            String title = sanitizeTitle(snippet.title());
            if (title == null && searchSnippet != null) {
                title = sanitizeTitle(searchSnippet.title());
            }

            String thumbnailUrl = resolveThumbnailUrl(snippet.thumbnails());
            if (thumbnailUrl == null && searchSnippet != null) {
                thumbnailUrl = resolveThumbnailUrl(searchSnippet.thumbnails());
            }
            return new ChannelMetadata(title, thumbnailUrl);
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

    private record ChannelIdentifier(String channelId, String username, String handle) {
    }

    private record SearchResult(String channelId, Snippet snippet) {
    }

    private record SearchResponse(List<SearchItem> items) {
    }

    private record SearchItem(SearchId id, Snippet snippet) {
    }

    private record SearchId(String channelId) {
    }

    private ChannelIdentifier parseChannelIdentifier(String value) {
        String trimmed = value == null ? null : value.trim();
        if (trimmed == null || trimmed.isEmpty()) {
            return new ChannelIdentifier(null, null, null);
        }

        if (CHANNEL_ID_PATTERN.matcher(trimmed).matches()) {
            return new ChannelIdentifier(trimmed, null, null);
        }

        if (trimmed.startsWith("@")) {
            return new ChannelIdentifier(null, null, trimmed.substring(1));
        }

        URI parsed = tryParseUrl(trimmed);
        if (parsed == null || parsed.getHost() == null || !isYouTubeHost(parsed.getHost())) {
            return new ChannelIdentifier(null, null, null);
        }

        String path = parsed.getPath();
        if (path == null) {
            return new ChannelIdentifier(null, null, null);
        }

        String[] segments = Arrays.stream(path.split("/"))
                .map(String::trim)
                .filter(part -> !part.isEmpty())
                .toArray(String[]::new);

        if (segments.length == 0) {
            return new ChannelIdentifier(null, null, null);
        }

        String first = segments[0];
        String second = segments.length > 1 ? segments[1] : null;

        if (first.startsWith("@")) {
            return new ChannelIdentifier(null, null, first.substring(1));
        }

        if ("channel".equalsIgnoreCase(first) && second != null) {
            String candidate = second.trim();
            if (CHANNEL_ID_PATTERN.matcher(candidate).matches()) {
                return new ChannelIdentifier(candidate, null, null);
            }
            return new ChannelIdentifier(null, null, null);
        }

        if (("user".equalsIgnoreCase(first) || "c".equalsIgnoreCase(first)) && second != null) {
            return new ChannelIdentifier(null, second.trim(), null);
        }

        if (segments.length == 1) {
            if (first.startsWith("@")) {
                return new ChannelIdentifier(null, null, first.substring(1));
            }
            return new ChannelIdentifier(null, first.trim(), null);
        }

        return new ChannelIdentifier(null, null, null);
    }

    private URI tryParseUrl(String value) {
        try {
            return new URI(value);
        } catch (URISyntaxException ignored) {
            try {
                return new URI("https://" + value);
            } catch (URISyntaxException ignore) {
                return null;
            }
        }
    }

    private boolean isYouTubeHost(String host) {
        String lower = host.toLowerCase();
        for (String suffix : YOUTUBE_HOST_SUFFIXES) {
            if (lower.equals(suffix) || lower.endsWith('.' + suffix)) {
                return true;
            }
        }
        return false;
    }

    private SearchResult searchChannelByHandle(String handle) {
        String normalized = handle == null ? null : handle.trim();
        if (normalized == null || normalized.isEmpty()) {
            return null;
        }
        String query = normalized.startsWith("@") ? normalized : '@' + normalized;
        try {
            SearchResponse response = restClient.get()
                    .uri(uriBuilder -> uriBuilder
                            .path("/search")
                            .queryParam("part", "snippet")
                            .queryParam("type", "channel")
                            .queryParam("maxResults", 1)
                            .queryParam("q", query)
                            .queryParam("key", apiKey)
                            .build())
                    .retrieve()
                    .body(SearchResponse.class);
            if (response == null || response.items() == null) {
                return null;
            }
            for (SearchItem item : response.items()) {
                if (item == null) {
                    continue;
                }
                SearchId id = item.id();
                String resolvedChannelId = id == null ? null : trimToNull(id.channelId());
                Snippet snippet = item.snippet();
                if (resolvedChannelId != null || snippet != null) {
                    return new SearchResult(resolvedChannelId, snippet);
                }
            }
        } catch (Exception ex) {
            log.warn("Failed to resolve channel handle {} via search API: {}", handle, ex.getMessage());
        }
        return null;
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private String sanitizeTitle(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
