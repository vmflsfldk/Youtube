package com.example.youtube.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record ClipUpdateRequest(
        @NotNull @Min(0) Integer startSec,
        @NotNull @Min(0) Integer endSec
) {
}
