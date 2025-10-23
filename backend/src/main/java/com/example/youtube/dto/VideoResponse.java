package com.example.youtube.dto;

import java.util.List;

public record VideoResponse(
        Long id,
        Long artistId,
        String youtubeVideoId,
        String title,
        Integer durationSec,
        String thumbnailUrl,
        String channelId,
        String category,
        String originalComposer,
        List<LocalizedTextResponse> titles,
        List<LocalizedTextResponse> originalComposers,
        List<VideoSectionResponse> sections
) {
}
