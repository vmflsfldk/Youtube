package com.example.youtube.dto;

public record LocalizedTextResponse(
        String languageCode,
        String value,
        String normalizedValue
) {
}
