package com.example.youtube.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import com.example.youtube.dto.ClipCandidateResponse;
import com.example.youtube.model.Video;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ClipAutoDetectionServiceTest {

    @Mock
    private VideoService videoService;

    private ClipAutoDetectionService service;

    @BeforeEach
    void setUp() {
        service = new ClipAutoDetectionService(videoService, new ObjectMapper());
    }

    @Test
    void detectFromDescriptionSupportsNumberedPrefixes() {
        Video video = new Video();
        video.setDescription("""
                1  . 00:20 アルジャーノン/ヨルシカ
                2) 00:55 Another Song
                """);

        when(videoService.getVideo(42L)).thenReturn(video);

        List<ClipCandidateResponse> candidates = service.detect(42L, "chapters");

        assertThat(candidates).hasSize(2);
        assertThat(candidates.get(0).startSec()).isEqualTo(20);
        assertThat(candidates.get(0).label()).isEqualTo("アルジャーノン/ヨルシカ");
        assertThat(candidates.get(1).startSec()).isEqualTo(55);
    }
}

