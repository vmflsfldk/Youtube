package com.example.youtube.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record VideoCreateRequest(
        @NotBlank String videoUrl,
        @NotNull Long artistId,
        String description,
        String captionsJson
) {
}
