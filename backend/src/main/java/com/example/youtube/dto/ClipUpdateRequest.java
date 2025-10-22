package com.example.youtube.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.util.List;

public record ClipUpdateRequest(
        @NotNull @Min(0) Integer startSec,
        @NotNull @Min(0) Integer endSec,
        List<@Valid LocalizedTextRequest> titles,
        List<@Valid LocalizedTextRequest> originalComposers
) {
}
