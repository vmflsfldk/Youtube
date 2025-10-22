package com.example.youtube.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record LocalizedTextRequest(
        @NotBlank @Size(max = 10) String languageCode,
        @NotBlank String value
) {
}
