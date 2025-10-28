package com.example.youtube.dto;

public record VideoMetadataUpdateRequest(
        String title,
        String originalComposer
) {
}
