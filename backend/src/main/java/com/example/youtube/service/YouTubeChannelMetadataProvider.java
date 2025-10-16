package com.example.youtube.service;

public interface YouTubeChannelMetadataProvider {

    ChannelMetadata fetch(String channelId);
}
