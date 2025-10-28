package com.example.youtube.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.example.youtube.dto.ClipCandidateResponse;
import com.example.youtube.model.Artist;
import com.example.youtube.model.UserAccount;
import com.example.youtube.model.Video;
import com.example.youtube.repository.ArtistRepository;
import com.example.youtube.repository.UserAccountRepository;
import com.example.youtube.repository.VideoRepository;
import com.example.youtube.service.ClipAutoDetectionService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class VideoControllerIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private UserAccountRepository userAccountRepository;

    @Autowired
    private ArtistRepository artistRepository;

    @Autowired
    private VideoRepository videoRepository;

    @MockBean
    private ClipAutoDetectionService clipAutoDetectionService;

    private Artist artist;

    @BeforeEach
    void setUp() {
        UserAccount user = userAccountRepository.save(new UserAccount("dana@example.com", "Dana"));
        artist = new Artist("Dana Artist", "다나", "channel-video", user, true, true, true);
        artistRepository.save(artist);
    }

    @Test
    void clipSuggestionsCreatesVideoAndReturnsExpectedResponse() throws Exception {
        List<ClipCandidateResponse> candidates = List.of(new ClipCandidateResponse(5, 35, 0.85, "Hook"));

        when(clipAutoDetectionService.detect(anyLong(), eq("combined")))
                .thenAnswer(invocation -> {
                    Long videoId = invocation.getArgument(0);
                    assertThat(videoRepository.findById(videoId)).isPresent();
                    return candidates;
                });

        Map<String, Object> payload = Map.of(
                "artistId", artist.getId(),
                "videoUrl", "https://www.youtube.com/watch?v=mockvideo11",
                "originalComposer", "Composer Name",
                "category", "cover");

        mockMvc.perform(post("/api/videos/clip-suggestions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(payload)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.video").exists())
                .andExpect(jsonPath("$.video.youtubeVideoId").value("mockvideo11"))
                .andExpect(jsonPath("$.video.artistId").value(artist.getId()))
                .andExpect(jsonPath("$.video.category").value("cover"))
                .andExpect(jsonPath("$.candidates[0].startSec").value(5))
                .andExpect(jsonPath("$.candidates[0].endSec").value(35))
                .andExpect(jsonPath("$.candidates[0].label").value("Hook"))
                .andExpect(jsonPath("$.status").value("created"))
                .andExpect(jsonPath("$.created").value(true))
                .andExpect(jsonPath("$.reused").value(false))
                .andExpect(jsonPath("$.message").doesNotExist());
    }

    @Test
    void updateCategoryUpdatesExistingVideo() throws Exception {
        Video video = new Video(artist, "existingvideo1", "Existing Title");
        video.setCategory("live");
        videoRepository.save(video);

        Map<String, Object> payload = Map.of("category", "cover");

        mockMvc.perform(patch("/api/videos/{id}/category", video.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(payload)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(video.getId()))
                .andExpect(jsonPath("$.category").value("cover"));

        assertThat(videoRepository.findById(video.getId()))
                .get()
                .extracting(Video::getCategory)
                .isEqualTo("cover");
    }

    @Test
    void updateMetadataUpdatesTitleAndOriginalComposer() throws Exception {
        Video video = new Video(artist, "existingvideo2", "Old Title");
        video.setOriginalComposer("Old Composer");
        videoRepository.save(video);

        Map<String, Object> payload = Map.of(
                "title", "New Video Title",
                "originalComposer", "New Composer"
        );

        mockMvc.perform(patch("/api/videos/{id}", video.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(payload)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(video.getId()))
                .andExpect(jsonPath("$.title").value("New Video Title"))
                .andExpect(jsonPath("$.originalComposer").value("New Composer"));

        assertThat(videoRepository.findById(video.getId()))
                .get()
                .extracting(Video::getTitle, Video::getOriginalComposer)
                .containsExactly("New Video Title", "New Composer");
    }
}
