package com.example.youtube.dto;

public record ArtistResponse(
        Long id,
        String name,
        String displayName,
        String youtubeChannelId,
        String profileImageUrl
) {
}
