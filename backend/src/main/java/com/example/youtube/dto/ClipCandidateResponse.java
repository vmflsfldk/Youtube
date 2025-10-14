package com.example.youtube.dto;

public record ClipCandidateResponse(
        int startSec,
        int endSec,
        double score,
        String label
) {
}
