package com.example.youtube.controller;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.example.youtube.dto.ClipCreateRequest;
import com.example.youtube.dto.LocalizedTextRequest;
import com.example.youtube.model.Artist;
import com.example.youtube.model.UserAccount;
import com.example.youtube.model.Video;
import com.example.youtube.repository.ArtistRepository;
import com.example.youtube.repository.UserAccountRepository;
import com.example.youtube.repository.VideoRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class ClipControllerIntegrationTest {

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

    private Video video;

    @BeforeEach
    void setUp() {
        UserAccount user = userAccountRepository.save(new UserAccount("bob@example.com", "Bob"));

        Artist artist = new Artist("Test Artist", "테스트", "channel-123", user, true, true, true);
        artist.setYoutubeChannelTitle("테스트 채널");
        artistRepository.save(artist);

        video = new Video(artist, "video123", "Test Video");
        videoRepository.save(video);
    }

    @Test
    void createClipWithInvalidRangeReturnsBadRequest() throws Exception {
        ClipCreateRequest invalidRequest = new ClipCreateRequest(
                video.getId(),
                List.of(new LocalizedTextRequest("en", "Invalid Clip")),
                30,
                20,
                List.of("tag1"),
                null,
                null);

        mockMvc.perform(post("/api/clips")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(invalidRequest)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void createClipWithDuplicateRangeReturnsConflict() throws Exception {
        ClipCreateRequest request = new ClipCreateRequest(
                video.getId(),
                List.of(new LocalizedTextRequest("en", "Clip")),
                10,
                20,
                List.of("tag1"),
                null,
                null);

        mockMvc.perform(post("/api/clips")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/clips")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isConflict());
    }

    @Test
    void createClipReturnsLocalizedFields() throws Exception {
        ClipCreateRequest request = new ClipCreateRequest(
                video.getId(),
                List.of(new LocalizedTextRequest("en", "Localized Clip")),
                0,
                30,
                List.of("tag1"),
                null,
                List.of(new LocalizedTextRequest("en", "Composer")));

        mockMvc.perform(post("/api/clips")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.titles[0].languageCode").value("en"))
                .andExpect(jsonPath("$.titles[0].value").value("Localized Clip"))
                .andExpect(jsonPath("$.originalComposers[0].value").value("Composer"));
    }

    @Test
    void listClipsWithoutFilterReturnsBadRequest() throws Exception {
        mockMvc.perform(get("/api/clips"))
                .andExpect(status().isBadRequest());
    }
}
