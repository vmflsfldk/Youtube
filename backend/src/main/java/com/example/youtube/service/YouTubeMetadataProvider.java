package com.example.youtube.service;

public interface YouTubeMetadataProvider {
    VideoMetadata fetch(String videoId);
}
