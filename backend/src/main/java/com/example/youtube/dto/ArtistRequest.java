package com.example.youtube.dto;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Locale;

public record ArtistRequest(
        @NotBlank String name,
        @NotBlank String displayName,
        @NotBlank String youtubeChannelId,
        boolean availableKo,
        boolean availableEn,
        boolean availableJp,
        List<@NotBlank String> tags,
        @Size(max = 255) String agency
) {

    @AssertTrue(message = "최소 한 개 이상의 국가를 선택해야 합니다.")
    public boolean hasAtLeastOneCountry() {
        return availableKo || availableEn || availableJp;
    }

    @AssertTrue(message = "태그는 중복될 수 없습니다.")
    public boolean hasUniqueTags() {
        if (tags == null) {
            return true;
        }
        long distinctCount = tags.stream()
                .map(tag -> tag.trim().toLowerCase(Locale.ROOT))
                .distinct()
                .count();
        return distinctCount == tags.size();
    }
}
