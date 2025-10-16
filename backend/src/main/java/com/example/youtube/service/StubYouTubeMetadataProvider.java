package com.example.youtube.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnMissingBean(YouTubeMetadataProvider.class)
public class StubYouTubeMetadataProvider implements YouTubeMetadataProvider {

    private static final Logger log = LoggerFactory.getLogger(StubYouTubeMetadataProvider.class);

    @Override
    public VideoMetadata fetch(String videoId) {
        log.warn("Using stub metadata for video {}. Configure a real provider for production.", videoId);
        return new VideoMetadata("Video " + videoId, null, null, null, null);
    }
}
