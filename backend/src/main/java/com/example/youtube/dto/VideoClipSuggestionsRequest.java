package com.example.youtube.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record VideoClipSuggestionsRequest(
        @NotBlank String videoUrl,
        @NotNull Long artistId,
        String originalComposer,
        String category
) {
}
