package com.example.youtube.dto;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;

public record ArtistRequest(
        @NotBlank String name,
        @NotBlank String displayName,
        @NotBlank String youtubeChannelId,
        boolean availableKo,
        boolean availableEn,
        boolean availableJp
) {

    @AssertTrue(message = "최소 한 개 이상의 국가를 선택해야 합니다.")
    public boolean hasAtLeastOneCountry() {
        return availableKo || availableEn || availableJp;
    }
}
