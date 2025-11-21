package com.example.youtube.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Locale;
import java.util.stream.Stream;

public record ArtistRequest(
        String nameKo,
        String nameEn,
        String nameJp,
        List<@Valid LocalizedTextRequest> names,
        @NotBlank String youtubeChannelId,
        @Size(max = 255) String chzzkChannelId,
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

    @AssertTrue(message = "이름은 중복 언어를 가질 수 없습니다.")
    public boolean hasUniqueLanguageCodes() {
        if (names == null || names.isEmpty()) {
            return true;
        }
        return names.stream()
                .map(LocalizedTextRequest::languageCode)
                .map(code -> code == null ? null : code.trim().toLowerCase(Locale.ROOT))
                .filter(code -> code != null && !code.isBlank())
                .distinct()
                .count() == names.size();
    }

    @AssertTrue(message = "최소 한 개 이상의 이름을 입력해야 합니다.")
    public boolean hasAtLeastOneLocalizedName() {
        boolean hasDirectLocalizedName = Stream.of(nameKo, nameEn, nameJp)
                .anyMatch(value -> value != null && !value.trim().isEmpty());

        boolean hasLegacyNames = names != null && names.stream()
                .anyMatch(name -> name != null
                        && name.value() != null
                        && !name.value().trim().isEmpty());

        return hasDirectLocalizedName || hasLegacyNames;
    }
}
