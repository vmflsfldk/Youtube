package com.example.youtube.controller;

import com.example.youtube.dto.VideoCategoryUpdateRequest;
import com.example.youtube.dto.VideoClipSuggestionsRequest;
import com.example.youtube.dto.VideoClipSuggestionsResponse;
import com.example.youtube.dto.VideoCreateRequest;
import com.example.youtube.dto.VideoMetadataUpdateRequest;
import com.example.youtube.dto.VideoResponse;
import com.example.youtube.service.VideoService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
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

    @PatchMapping("/{id}")
    public VideoResponse updateVideoMetadata(
            @PathVariable("id") Long id,
            @RequestBody VideoMetadataUpdateRequest request) {
        return videoService.updateMetadata(id, request);
    }

    @PatchMapping("/{id}/category")
    public VideoResponse updateVideoCategory(
            @PathVariable("id") Long id,
            @RequestBody VideoCategoryUpdateRequest request) {
        return videoService.updateCategory(id, request);
    }

    @PostMapping("/clip-suggestions")
    public VideoClipSuggestionsResponse suggestClips(
            @Valid @RequestBody VideoClipSuggestionsRequest request) {
        return videoService.registerAndSuggest(request);
    }

    @GetMapping
    public List<VideoResponse> listVideos(@RequestParam("artistId") Long artistId) {
        return videoService.listByArtist(artistId);
    }

}
