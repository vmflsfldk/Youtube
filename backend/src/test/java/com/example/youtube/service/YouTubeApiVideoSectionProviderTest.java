package com.example.youtube.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.youtube.model.VideoSectionSource;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

class YouTubeApiVideoSectionProviderTest {

    @Test
    void extractSectionsSupportsNumberedPrefixes() {
        YouTubeApiVideoSectionProvider provider =
                new YouTubeApiVideoSectionProvider(RestClient.builder(), "");

        String description = """
                1. 00:00 Opening
                2) 01:30 Deep Dive
                - 03:45 Summary
                • 05:00 Outro
                """;

        List<YouTubeVideoSectionProvider.VideoSectionData> sections =
                provider.fetch("video123", description, 360);

        assertThat(sections)
                .hasSize(4)
                .allSatisfy(section -> assertThat(section.source()).isEqualTo(VideoSectionSource.VIDEO_DESCRIPTION));

        assertThat(sections.get(0).title()).isEqualTo("Opening");
        assertThat(sections.get(0).startSec()).isEqualTo(0);
        assertThat(sections.get(0).endSec()).isEqualTo(90);

        assertThat(sections.get(1).title()).isEqualTo("Deep Dive");
        assertThat(sections.get(1).startSec()).isEqualTo(90);
        assertThat(sections.get(1).endSec()).isEqualTo(225);

        assertThat(sections.get(2).title()).isEqualTo("Summary");
        assertThat(sections.get(2).startSec()).isEqualTo(225);
        assertThat(sections.get(2).endSec()).isEqualTo(300);

        assertThat(sections.get(3).title()).isEqualTo("Outro");
        assertThat(sections.get(3).startSec()).isEqualTo(300);
        assertThat(sections.get(3).endSec()).isEqualTo(345);
    }

    @Test
    void extractSectionsHandlesCommentNumberingWithWhitespaceOnly() {
        YouTubeApiVideoSectionProvider provider =
                new YouTubeApiVideoSectionProvider(RestClient.builder(), "");

        String description = """
                1 00:05 Intro
                2 00:45 Topic
                3 01:15 Wrap
                """;

        List<YouTubeVideoSectionProvider.VideoSectionData> sections =
                provider.fetch("video456", description, null);

        assertThat(sections)
                .hasSize(3)
                .extracting(YouTubeVideoSectionProvider.VideoSectionData::title)
                .containsExactly("Intro", "Topic", "Wrap");

        assertThat(sections)
                .extracting(YouTubeVideoSectionProvider.VideoSectionData::startSec)
                .containsExactly(5, 45, 75);

        assertThat(sections.get(2).endSec()).isEqualTo(120);
    }
}
