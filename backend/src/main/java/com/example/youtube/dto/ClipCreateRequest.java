package com.example.youtube.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

public record ClipCreateRequest(
        @NotNull Long videoId,
        @NotNull @Size(min = 1) List<@Valid LocalizedTextRequest> titles,
        @Min(0) int startSec,
        @Min(0) int endSec,
        List<String> tags,
        Boolean videoHidden,
        List<@Valid LocalizedTextRequest> originalComposers
) {
}
