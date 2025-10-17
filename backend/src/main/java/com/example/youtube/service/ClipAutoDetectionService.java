package com.example.youtube.service;

import com.example.youtube.dto.ClipCandidateResponse;
import com.example.youtube.model.Video;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;

@Service
public class ClipAutoDetectionService {

    private static final Pattern TIMESTAMP_PATTERN = Pattern.compile(
            "^(?:(?:\\d+\\s*[\\.)-]\\s*)|(?:\\d+\\s+)|(?:[-•*]\\s*))?(?:(\\d{1,2}):)?(\\d{1,2}):(\\d{2})\\s*-?\\s*(.*)$");
    private static final int DEFAULT_CLIP_LENGTH = 30;
    private static final List<String> KEYWORDS = List.of("chorus", "hook", "verse", "intro", "outro");

    private final VideoService videoService;
    private final ObjectMapper objectMapper;

    public ClipAutoDetectionService(VideoService videoService, ObjectMapper objectMapper) {
        this.videoService = videoService;
        this.objectMapper = objectMapper;
    }

    public List<ClipCandidateResponse> detect(Long videoId, String mode) {
        Video video = videoService.getVideo(videoId);
        return switch (mode.toLowerCase(Locale.ROOT)) {
            case "chapters" -> detectFromDescription(video);
            case "captions" -> detectFromCaptions(video);
            default -> {
                List<ClipCandidateResponse> combined = new ArrayList<>();
                combined.addAll(detectFromDescription(video));
                combined.addAll(detectFromCaptions(video));
                combined.sort(Comparator.comparingInt(ClipCandidateResponse::startSec));
                yield combined;
            }
        };
    }

    private List<ClipCandidateResponse> detectFromDescription(Video video) {
        if (video.getDescription() == null || video.getDescription().isBlank()) {
            return Collections.emptyList();
        }
        List<ClipCandidateResponse> responses = new ArrayList<>();
        List<Chapter> chapters = new ArrayList<>();
        for (String line : video.getDescription().split("\\r?\\n")) {
            Matcher matcher = TIMESTAMP_PATTERN.matcher(line.trim());
            if (matcher.matches()) {
                int hour = matcher.group(1) != null ? Integer.parseInt(matcher.group(1)) : 0;
                int minute = Integer.parseInt(matcher.group(2));
                int second = Integer.parseInt(matcher.group(3));
                int start = hour * 3600 + minute * 60 + second;
                String label = matcher.group(4) != null ? matcher.group(4).trim() : "Chapter";
                chapters.add(new Chapter(start, label));
            }
        }
        chapters.sort(Comparator.comparingInt(Chapter::start));
        if (chapters.isEmpty()) {
            return Collections.emptyList();
        }
        for (int i = 0; i < chapters.size(); i++) {
            Chapter current = chapters.get(i);
            int end = i + 1 < chapters.size() ? chapters.get(i + 1).start() : current.start() + DEFAULT_CLIP_LENGTH;
            if (video.getDurationSec() != null) {
                end = Math.min(end, video.getDurationSec());
            }
            double score = 0.6;
            if (containsKeyword(current.label())) {
                score += 0.3;
            }
            responses.add(new ClipCandidateResponse(current.start(), Math.max(current.start() + 5, end), score,
                    current.label()));
        }
        return responses;
    }

    private List<ClipCandidateResponse> detectFromCaptions(Video video) {
        String captionsJson = video.getCaptionsJson();
        if (captionsJson == null || captionsJson.isBlank()) {
            return Collections.emptyList();
        }
        List<CaptionLine> lines = parseCaptions(captionsJson);
        if (lines.isEmpty()) {
            return Collections.emptyList();
        }
        List<ClipCandidateResponse> responses = new ArrayList<>();
        for (CaptionLine line : lines) {
            if (containsKeyword(line.text())) {
                int end = line.start() + DEFAULT_CLIP_LENGTH;
                if (video.getDurationSec() != null) {
                    end = Math.min(end, video.getDurationSec());
                }
                responses.add(new ClipCandidateResponse(line.start(), end, 0.8, line.text()));
            }
        }
        if (responses.isEmpty()) {
            // fallback: use first lines spaced by 45 seconds
            int window = 45;
            for (CaptionLine line : lines) {
                int end = line.start() + window;
                if (video.getDurationSec() != null) {
                    end = Math.min(end, video.getDurationSec());
                }
                responses.add(new ClipCandidateResponse(line.start(), end, 0.4, truncate(line.text())));
                if (responses.size() >= 5) {
                    break;
                }
            }
        }
        return responses;
    }

    private boolean containsKeyword(String text) {
        String lower = text.toLowerCase(Locale.ROOT);
        return KEYWORDS.stream().anyMatch(lower::contains);
    }

    private List<CaptionLine> parseCaptions(String captionsJson) {
        try {
            if (captionsJson.trim().startsWith("[")) {
                List<Map<String, Object>> nodes = objectMapper.readValue(captionsJson,
                        new TypeReference<>() {
                        });
                List<CaptionLine> lines = new ArrayList<>();
                for (Map<String, Object> node : nodes) {
                    Object startValue = node.getOrDefault("start", node.getOrDefault("offset", 0));
                    int start = startValue instanceof Number ? ((Number) startValue).intValue()
                            : Integer.parseInt(startValue.toString());
                    Object textValue = node.getOrDefault("text", node.getOrDefault("content", ""));
                    String text = textValue == null ? "" : textValue.toString();
                    lines.add(new CaptionLine(start, text));
                }
                lines.sort(Comparator.comparingInt(CaptionLine::start));
                return lines;
            }
            // fallback simple format: start|text
            List<CaptionLine> lines = new ArrayList<>();
            for (String line : captionsJson.split("\\r?\\n")) {
                String[] parts = line.split("\\|", 2);
                if (parts.length == 2) {
                    int start = Integer.parseInt(parts[0].trim());
                    lines.add(new CaptionLine(start, parts[1].trim()));
                }
            }
            return lines;
        } catch (Exception ex) {
            return Collections.emptyList();
        }
    }

    private String truncate(String text) {
        if (text.length() <= 40) {
            return text;
        }
        return text.substring(0, 40) + "...";
    }

    private record Chapter(int start, String label) {
    }

    private record CaptionLine(int start, String text) {
    }
}
