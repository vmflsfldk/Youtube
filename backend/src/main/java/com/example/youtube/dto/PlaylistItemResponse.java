package com.example.youtube.dto;

import java.time.Instant;

public record PlaylistItemResponse(
        Long id,
        Long playlistId,
        int ordering,
        Instant createdAt,
        Instant updatedAt,
        String type,
        VideoResponse video,
        ClipResponse clip
) {
}
