package com.example.youtube.service;

public record VideoMetadata(
        String title,
        Integer durationSec,
        String thumbnailUrl,
        String channelId,
        String description
) {
}
