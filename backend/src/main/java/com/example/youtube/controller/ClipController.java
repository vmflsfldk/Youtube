package com.example.youtube.controller;

import com.example.youtube.dto.ClipAutoDetectRequest;
import com.example.youtube.dto.ClipCandidateResponse;
import com.example.youtube.dto.ClipCreateRequest;
import com.example.youtube.dto.ClipResponse;
import com.example.youtube.service.ClipAutoDetectionService;
import com.example.youtube.service.ClipService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class ClipController {

    private final ClipService clipService;
    private final ClipAutoDetectionService clipAutoDetectionService;

    public ClipController(ClipService clipService, ClipAutoDetectionService clipAutoDetectionService) {
        this.clipService = clipService;
        this.clipAutoDetectionService = clipAutoDetectionService;
    }

    @PostMapping("/clips")
    public ClipResponse createClip(@Valid @RequestBody ClipCreateRequest request) {
        return clipService.create(request);
    }

    @GetMapping("/clips")
    public List<ClipResponse> listClips(@RequestParam(value = "artistId", required = false) Long artistId,
                                        @RequestParam(value = "videoId", required = false) Long videoId) {
        if (artistId != null) {
            return clipService.listByArtist(artistId);
        }
        if (videoId != null) {
            return clipService.listByVideo(videoId);
        }
        throw new IllegalArgumentException("artistId or videoId must be provided");
    }

    @PostMapping("/clips/auto-detect")
    public List<ClipCandidateResponse> autoDetect(@Valid @RequestBody ClipAutoDetectRequest request) {
        return clipAutoDetectionService.detect(request.videoId(), request.mode());
    }
}
