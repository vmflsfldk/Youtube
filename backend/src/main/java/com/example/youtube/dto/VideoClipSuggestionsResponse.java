package com.example.youtube.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record VideoClipSuggestionsResponse(
        VideoResponse video,
        List<ClipCandidateResponse> candidates,
        String status,
        String message,
        Boolean created,
        Boolean reused
) {
}
