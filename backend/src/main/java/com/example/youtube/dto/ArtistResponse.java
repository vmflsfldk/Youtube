package com.example.youtube.dto;

import java.util.List;

public record ArtistResponse(
        Long id,
        String name,
        String displayName,
        String nameKo,
        String nameEn,
        String nameJp,
        String youtubeChannelId,
        String youtubeChannelTitle,
        String chzzkChannelId,
        String profileImageUrl,
        boolean availableKo,
        boolean availableEn,
        boolean availableJp,
        String agency,
        List<String> tags,
        List<LocalizedTextResponse> names
) {
}
