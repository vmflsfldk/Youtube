package com.example.youtube.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import java.util.List;

public record ArtistProfileRequest(
        List<String> tags,
        @Size(max = 255) String agency,
        String nameKo,
        String nameEn,
        String nameJp,
        List<@Valid LocalizedTextRequest> names,
        @Size(max = 255) String chzzkChannelId
) {
}
