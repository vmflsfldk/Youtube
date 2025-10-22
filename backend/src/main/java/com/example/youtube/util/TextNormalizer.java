package com.example.youtube.util;

import java.text.Normalizer;
import java.util.Locale;

public final class TextNormalizer {

    private TextNormalizer() {
    }

    public static String normalize(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        if (trimmed.isEmpty()) {
            return "";
        }
        String decomposed = Normalizer.normalize(trimmed, Normalizer.Form.NFKD);
        String withoutMarks = decomposed.replaceAll("\\p{M}", "");
        String lowerCased = withoutMarks.toLowerCase(Locale.ROOT);
        String alnumAndSpaceOnly = lowerCased.replaceAll("[^\\p{Alnum}\\s]", " ");
        String collapsedSpaces = alnumAndSpaceOnly.replaceAll("\\s+", " ").trim();
        return collapsedSpaces;
    }
}
