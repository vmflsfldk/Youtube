package com.example.youtube.dto;

import java.util.List;

public record VideoResponse(
        Long id,
        Long artistId,
        Long primaryArtistId,
        String youtubeVideoId,
        String title,
        Integer durationSec,
        String thumbnailUrl,
        String channelId,
        String contentType,
        String category,
        Boolean hidden,
        String createdAt,
        String updatedAt,
        String originalComposer,
        String artistName,
        String artistDisplayName,
        String artistYoutubeChannelId,
        String artistYoutubeChannelTitle,
        String artistProfileImageUrl,
        List<LocalizedTextResponse> titles,
        List<LocalizedTextResponse> originalComposers,
        List<VideoSectionResponse> sections,
        List<VideoArtistResponse> artists
) {
}
