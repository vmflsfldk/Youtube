package com.example.youtube.dto;

import jakarta.validation.constraints.NotNull;
import java.util.List;

public record ArtistTagRequest(
        @NotNull List<String> tags
) {
}
