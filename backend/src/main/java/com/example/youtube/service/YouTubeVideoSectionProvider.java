package com.example.youtube.service;

import com.example.youtube.model.VideoSectionSource;
import java.util.List;

public interface YouTubeVideoSectionProvider {

    List<VideoSectionData> fetch(String videoId, String description, Integer durationSec);

    record VideoSectionData(String title, int startSec, int endSec, VideoSectionSource source) {
    }
}
