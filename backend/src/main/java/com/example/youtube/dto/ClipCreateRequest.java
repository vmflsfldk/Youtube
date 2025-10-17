package com.example.youtube.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import java.util.List;

public record ClipCreateRequest(
        Long videoId,
        Long artistId,
        String youtubeVideoId,
        @NotBlank String title,
        @Min(0) int startSec,
        @Min(0) int endSec,
        List<String> tags,
        Boolean videoHidden
) {
}
