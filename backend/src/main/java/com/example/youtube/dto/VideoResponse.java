package com.example.youtube.dto;

public record VideoResponse(
        Long id,
        Long artistId,
        String youtubeVideoId,
        String title,
        Integer durationSec,
        String thumbnailUrl,
        String channelId
) {
}
