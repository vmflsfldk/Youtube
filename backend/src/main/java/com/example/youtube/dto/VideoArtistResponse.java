package com.example.youtube.dto;

public record VideoArtistResponse(
        Long id,
        String name,
        String displayName,
        String youtubeChannelId,
        String youtubeChannelTitle,
        String profileImageUrl,
        boolean isPrimary
) {
}
