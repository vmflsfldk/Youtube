package com.example.youtube.dto;

import java.util.List;

public record ClipResponse(
        Long id,
        Long videoId,
        String title,
        int startSec,
        int endSec,
        List<String> tags,
        String originalComposer,
        String youtubeVideoId,
        String videoTitle,
        String videoOriginalComposer,
        Long artistId,
        Long primaryArtistId,
        String artistName,
        String artistDisplayName,
        String artistYoutubeChannelId,
        String artistYoutubeChannelTitle,
        String artistProfileImageUrl,
        List<VideoArtistResponse> artists,
        List<LocalizedTextResponse> titles,
        List<LocalizedTextResponse> originalComposers,
        String createdAt,
        String updatedAt
) {
}
