package com.example.youtube.controller;

import com.example.youtube.dto.VideoCreateRequest;
import com.example.youtube.dto.VideoResponse;
import com.example.youtube.service.VideoService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/videos")
public class VideoController {

    private final VideoService videoService;

    public VideoController(VideoService videoService) {
        this.videoService = videoService;
    }

    @PostMapping
    public VideoResponse createVideo(@Valid @RequestBody VideoCreateRequest request) {
        return videoService.create(request);
    }

    @GetMapping
    public List<VideoResponse> listVideos(@RequestParam("artistId") Long artistId) {
        return videoService.listByArtist(artistId);
    }
}
