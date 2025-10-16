package com.example.youtube.service;

public record ChannelMetadata(
        String title,
        String profileImageUrl
) {

    public static ChannelMetadata empty() {
        return new ChannelMetadata(null, null);
    }
}
