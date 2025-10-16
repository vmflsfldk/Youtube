package com.example.youtube.service;

import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnMissingBean(YouTubeVideoSectionProvider.class)
public class StubYouTubeVideoSectionProvider implements YouTubeVideoSectionProvider {

    private static final Logger log = LoggerFactory.getLogger(StubYouTubeVideoSectionProvider.class);

    @Override
    public List<VideoSectionData> fetch(String videoId, String description, Integer durationSec) {
        log.warn("Using stub video section provider for video {}. Configure a real provider for production.", videoId);
        return List.of();
    }
}
