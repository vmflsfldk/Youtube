package com.example.youtube.dto;

import java.util.List;

public record ArtistResponse(
        Long id,
        String name,
        String displayName,
        String youtubeChannelId,
        String profileImageUrl,
        boolean availableKo,
        boolean availableEn,
        boolean availableJp,
        List<String> tags
) {
}
