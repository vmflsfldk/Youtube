package com.example.youtube.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.List;

public record VideoCreateRequest(
        @NotBlank String videoUrl,
        @NotNull Long artistId,
        String description,
        String captionsJson,
        String category,
        List<@Valid LocalizedTextRequest> titles,
        List<@Valid LocalizedTextRequest> originalComposers
) {
}
