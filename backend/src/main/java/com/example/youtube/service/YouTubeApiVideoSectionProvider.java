package com.example.youtube.service;

import com.example.youtube.model.VideoSectionSource;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class YouTubeApiVideoSectionProvider implements YouTubeVideoSectionProvider {

    private static final Logger log = LoggerFactory.getLogger(YouTubeApiVideoSectionProvider.class);
    private static final Pattern TIMESTAMP_PATTERN = Pattern.compile("(?:(\\d{1,2}):)?(\\d{1,2}):(\\d{2})\\s*-?\\s*(.+)");
    private static final int DEFAULT_SECTION_LENGTH = 45;

    private final RestClient restClient;
    private final String apiKey;

    public YouTubeApiVideoSectionProvider(RestClient.Builder restClientBuilder,
                                          @Value("${app.youtube.api-key:}") String apiKey) {
        this.restClient = restClientBuilder
                .baseUrl("https://www.googleapis.com/youtube/v3")
                .build();
        this.apiKey = apiKey == null ? "" : apiKey.trim();
    }

    @Override
    public List<VideoSectionData> fetch(String videoId, String description, Integer durationSec) {
        if (videoId == null || videoId.isBlank()) {
            return List.of();
        }

        List<VideoSectionData> fromApi = fetchFromApi(videoId, durationSec);
        if (!fromApi.isEmpty()) {
            return fromApi;
        }

        List<VideoSectionData> fromComments = fetchFromComments(videoId, durationSec);
        if (!fromComments.isEmpty()) {
            return fromComments;
        }

        List<VideoSectionData> fromDescription = extractSections(description, durationSec, VideoSectionSource.VIDEO_DESCRIPTION);
        if (!fromDescription.isEmpty()) {
            return fromDescription;
        }

        return List.of();
    }

    private List<VideoSectionData> fetchFromApi(String videoId, Integer durationSec) {
        if (apiKey.isBlank()) {
            log.debug("Skipping YouTube chapters fetch for {} because API key is missing.", videoId);
            return List.of();
        }
        try {
            JsonNode response = restClient.get()
                    .uri(uriBuilder -> uriBuilder
                            .path("/videos")
                            .queryParam("part", "chapters")
                            .queryParam("id", videoId)
                            .queryParam("key", apiKey)
                            .build())
                    .retrieve()
                    .body(JsonNode.class);

            if (response == null) {
                return List.of();
            }

            JsonNode items = response.get("items");
            if (items == null || !items.isArray() || items.isEmpty()) {
                return List.of();
            }

            JsonNode item = items.get(0);
            if (item == null) {
                return List.of();
            }

            JsonNode chaptersNode = item.path("chapters").path("chapters");
            if (!chaptersNode.isArray() || chaptersNode.isEmpty()) {
                return List.of();
            }

            List<VideoSectionData> sections = new ArrayList<>();
            for (JsonNode chapterNode : chaptersNode) {
                if (chapterNode == null || chapterNode.isNull()) {
                    continue;
                }
                String title = normalizeLabel(chapterNode.path("title").asText(""));
                int start = parseChapterBoundary(chapterNode.path("startTime"));
                int end = parseChapterBoundary(chapterNode.path("endTime"));
                if (start < 0) {
                    continue;
                }
                if (end <= start) {
                    end = start + DEFAULT_SECTION_LENGTH;
                }
                if (durationSec != null) {
                    end = Math.min(end, durationSec);
                }
                end = Math.max(end, start + 5);
                sections.add(new VideoSectionData(title, start, end, VideoSectionSource.YOUTUBE_CHAPTER));
            }
            return sections;
        } catch (Exception ex) {
            log.warn("Failed to fetch YouTube chapters for {}: {}", videoId, ex.getMessage());
            return List.of();
        }
    }

    private List<VideoSectionData> fetchFromComments(String videoId, Integer durationSec) {
        if (apiKey.isBlank()) {
            log.debug("Skipping YouTube comments fetch for {} because API key is missing.", videoId);
            return List.of();
        }
        try {
            CommentThreadsResponse response = restClient.get()
                    .uri(uriBuilder -> uriBuilder
                            .path("/commentThreads")
                            .queryParam("part", "snippet")
                            .queryParam("videoId", videoId)
                            .queryParam("maxResults", 20)
                            .queryParam("order", "relevance")
                            .queryParam("textFormat", "plainText")
                            .queryParam("key", apiKey)
                            .build())
                    .retrieve()
                    .body(CommentThreadsResponse.class);

            if (response == null || response.items() == null) {
                return List.of();
            }

            for (CommentThreadItem item : response.items()) {
                if (item == null || item.snippet() == null || item.snippet().topLevelComment() == null) {
                    continue;
                }
                CommentSnippet commentSnippet = item.snippet().topLevelComment().snippet();
                if (commentSnippet == null) {
                    continue;
                }
                String text = commentSnippet.textDisplay();
                List<VideoSectionData> sections = extractSections(text, durationSec, VideoSectionSource.COMMENT);
                if (sections.size() >= 2) {
                    return sections;
                }
            }
        } catch (Exception ex) {
            log.warn("Failed to fetch YouTube comments for {}: {}", videoId, ex.getMessage());
        }
        return List.of();
    }

    private List<VideoSectionData> extractSections(String text, Integer durationSec, VideoSectionSource source) {
        if (text == null || text.isBlank()) {
            return List.of();
        }
        List<SectionCandidate> candidates = new ArrayList<>();
        String[] lines = text.split("\\r?\\n");
        for (String line : lines) {
            String trimmed = line.trim();
            if (trimmed.isEmpty()) {
                continue;
            }
            Matcher matcher = TIMESTAMP_PATTERN.matcher(trimmed);
            if (!matcher.matches()) {
                continue;
            }
            int hours = matcher.group(1) != null ? Integer.parseInt(matcher.group(1)) : 0;
            int minutes = Integer.parseInt(matcher.group(2));
            int seconds = Integer.parseInt(matcher.group(3));
            int start = hours * 3600 + minutes * 60 + seconds;
            if (start < 0) {
                continue;
            }
            String label = matcher.group(4) != null ? matcher.group(4).trim() : "";
            candidates.add(new SectionCandidate(start, label));
        }
        if (candidates.size() < 2) {
            return List.of();
        }
        candidates.sort(Comparator.comparingInt(SectionCandidate::start));
        List<VideoSectionData> sections = new ArrayList<>();
        for (int i = 0; i < candidates.size(); i++) {
            SectionCandidate current = candidates.get(i);
            int nextStart = i + 1 < candidates.size() ? candidates.get(i + 1).start() : -1;
            int end = nextStart > current.start() ? nextStart : current.start() + DEFAULT_SECTION_LENGTH;
            if (durationSec != null) {
                end = Math.min(end, durationSec);
            }
            end = Math.max(end, current.start() + 5);
            sections.add(new VideoSectionData(normalizeLabel(current.label()), current.start(), end, source));
        }
        return sections;
    }

    private int parseChapterBoundary(JsonNode node) {
        if (node == null || node.isMissingNode()) {
            return -1;
        }
        int candidate = parseSeconds(node);
        if (candidate >= 0) {
            return candidate;
        }
        candidate = parseMilliseconds(node);
        if (candidate >= 0) {
            return candidate;
        }
        candidate = parseSeconds(node.get("seconds"));
        if (candidate >= 0) {
            return candidate;
        }
        candidate = parseSeconds(node.get("offsetSeconds"));
        if (candidate >= 0) {
            return candidate;
        }
        candidate = parseMilliseconds(node.get("offsetMs"));
        if (candidate >= 0) {
            return candidate;
        }
        candidate = parseMilliseconds(node.get("ms"));
        if (candidate >= 0) {
            return candidate;
        }
        return -1;
    }

    private int parseSeconds(JsonNode node) {
        if (node == null || node.isMissingNode()) {
            return -1;
        }
        if (node.isInt() || node.isLong()) {
            int value = node.asInt();
            return value >= 0 ? value : -1;
        }
        if (node.isFloat() || node.isDouble() || node.isBigDecimal()) {
            double value = node.asDouble();
            if (Double.isFinite(value) && value >= 0) {
                return (int) Math.floor(value);
            }
            return -1;
        }
        if (node.isTextual()) {
            String text = node.asText().trim();
            if (text.isEmpty()) {
                return -1;
            }
            if (text.endsWith("ms")) {
                return parseMilliseconds(text.substring(0, text.length() - 2));
            }
            if (text.startsWith("PT")) {
                return parseIsoDurationSeconds(text);
            }
            try {
                double value = Double.parseDouble(text);
                if (Double.isFinite(value) && value >= 0) {
                    return (int) Math.floor(value);
                }
            } catch (NumberFormatException ignored) {
            }
            return -1;
        }
        return -1;
    }

    private int parseMilliseconds(JsonNode node) {
        if (node == null || node.isMissingNode()) {
            return -1;
        }
        if (node.isInt() || node.isLong()) {
            long value = node.asLong();
            if (value < 0) {
                return -1;
            }
            return (int) Math.floor(value / 1000.0);
        }
        if (node.isFloat() || node.isDouble() || node.isBigDecimal()) {
            double value = node.asDouble();
            if (!Double.isFinite(value) || value < 0) {
                return -1;
            }
            return (int) Math.floor(value / 1000.0);
        }
        if (node.isTextual()) {
            return parseMilliseconds(node.asText());
        }
        return -1;
    }

    private int parseMilliseconds(String raw) {
        if (raw == null) {
            return -1;
        }
        String text = raw.trim();
        if (text.isEmpty()) {
            return -1;
        }
        try {
            double value = Double.parseDouble(text);
            if (!Double.isFinite(value) || value < 0) {
                return -1;
            }
            return (int) Math.floor(value / 1000.0);
        } catch (NumberFormatException ex) {
            return -1;
        }
    }

    private int parseIsoDurationSeconds(String iso) {
        if (iso == null) {
            return -1;
        }
        String trimmed = iso.trim();
        if (trimmed.isEmpty()) {
            return -1;
        }
        try {
            java.time.Duration duration = java.time.Duration.parse(trimmed);
            if (duration.isNegative()) {
                return -1;
            }
            long seconds = duration.getSeconds();
            if (seconds < 0) {
                return -1;
            }
            if (seconds > Integer.MAX_VALUE) {
                return Integer.MAX_VALUE;
            }
            return (int) seconds;
        } catch (Exception ex) {
            return -1;
        }
    }

    private String normalizeLabel(String label) {
        if (label == null) {
            return "";
        }
        String trimmed = label.trim();
        if (trimmed.isEmpty()) {
            return "Track";
        }
        if (trimmed.length() > 120) {
            return trimmed.substring(0, 120);
        }
        return trimmed;
    }

    private record CommentThreadsResponse(List<CommentThreadItem> items) {
    }

    private record CommentThreadItem(CommentThreadSnippet snippet) {
    }

    private record CommentThreadSnippet(TopLevelComment topLevelComment) {
    }

    private record TopLevelComment(CommentSnippet snippet) {
    }

    private record CommentSnippet(String textDisplay) {
    }

    private record SectionCandidate(int start, String label) {
    }
}
