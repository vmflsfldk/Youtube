package com.example.youtube.dto;

import java.util.List;

public record ClipResponse(
        Long id,
        Long videoId,
        String title,
        int startSec,
        int endSec,
        List<String> tags
) {
}
