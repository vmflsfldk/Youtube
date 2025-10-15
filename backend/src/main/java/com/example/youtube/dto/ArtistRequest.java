package com.example.youtube.dto;

import jakarta.validation.constraints.NotBlank;

public record ArtistRequest(
        @NotBlank String name,
        @NotBlank String displayName,
        @NotBlank String youtubeChannelId
) {
}
