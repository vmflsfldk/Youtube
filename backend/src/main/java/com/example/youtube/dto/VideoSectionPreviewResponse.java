package com.example.youtube.dto;

import java.util.List;

public record VideoSectionPreviewResponse(
        List<VideoSectionResponse> sections,
        Integer durationSec
) {
}
