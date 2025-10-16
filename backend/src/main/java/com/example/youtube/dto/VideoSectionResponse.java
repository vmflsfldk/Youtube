package com.example.youtube.dto;

public record VideoSectionResponse(
        String title,
        int startSec,
        int endSec,
        String source
) {
}
