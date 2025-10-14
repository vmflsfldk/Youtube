package com.example.youtube.dto;

import jakarta.validation.constraints.NotNull;

public record ClipAutoDetectRequest(
        @NotNull Long videoId,
        @NotNull String mode
) {
}
