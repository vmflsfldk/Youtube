package com.example.youtube.service;

import com.example.youtube.dto.ClipResponse;
import com.example.youtube.dto.LibraryMediaResponse;
import com.example.youtube.dto.VideoResponse;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class LibraryService {

    private final VideoService videoService;
    private final ClipService clipService;

    public LibraryService(VideoService videoService, ClipService clipService) {
        this.videoService = videoService;
        this.clipService = clipService;
    }

    @Transactional(readOnly = true)
    public LibraryMediaResponse getLibraryMedia() {
        List<VideoResponse> videos = videoService.listAll();
        List<ClipResponse> clips = clipService.listAll();
        return new LibraryMediaResponse(videos, clips);
    }
}
