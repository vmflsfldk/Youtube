package com.example.youtube.dto;

import java.util.List;

public record LibraryMediaResponse(
        List<VideoResponse> videos,
        List<ClipResponse> clips
) {
}
