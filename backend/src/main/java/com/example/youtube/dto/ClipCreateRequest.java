package com.example.youtube.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.List;

public record ClipCreateRequest(
        @NotNull Long videoId,
        @NotBlank String title,
        @Min(0) int startSec,
        @Min(0) int endSec,
        List<String> tags,
        Boolean videoHidden,
        String originalComposer
) {
}
