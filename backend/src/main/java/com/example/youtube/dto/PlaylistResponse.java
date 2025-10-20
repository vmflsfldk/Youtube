package com.example.youtube.dto;

import java.time.Instant;
import java.util.List;

public record PlaylistResponse(
        Long id,
        Long ownerId,
        String title,
        String visibility,
        Instant createdAt,
        Instant updatedAt,
        List<PlaylistItemResponse> items
) {
}
