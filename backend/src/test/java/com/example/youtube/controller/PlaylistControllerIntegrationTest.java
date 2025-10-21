package com.example.youtube.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.example.youtube.model.Artist;
import com.example.youtube.model.Clip;
import com.example.youtube.model.Playlist;
import com.example.youtube.model.UserAccount;
import com.example.youtube.model.Video;
import com.example.youtube.model.VideoSection;
import com.example.youtube.model.VideoSectionSource;
import com.example.youtube.repository.ArtistRepository;
import com.example.youtube.repository.ClipRepository;
import com.example.youtube.repository.PlaylistRepository;
import com.example.youtube.repository.UserAccountRepository;
import com.example.youtube.repository.VideoRepository;
import com.example.youtube.repository.VideoSectionRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class PlaylistControllerIntegrationTest {

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

    @Autowired
    private ClipRepository clipRepository;

    @Autowired
    private PlaylistRepository playlistRepository;

    @Autowired
    private VideoSectionRepository videoSectionRepository;

    private UserAccount user;
    private Playlist playlist;
    private Video video;
    private Clip clip;

    @BeforeEach
    void setUp() {
        user = userAccountRepository.save(new UserAccount("alice@example.com", "Alice"));

        Artist artist = new Artist("Test Artist", "테스트", "channel-123", user, true, true, true);
        artist.setYoutubeChannelTitle("테스트 채널");
        artistRepository.save(artist);

        video = new Video(artist, "video1234567", "Test Video");
        video.setDurationSec(180);
        video.setThumbnailUrl("https://example.com/thumb.jpg");
        video.setChannelId("channel-123");
        videoRepository.save(video);

        VideoSection laterSection = new VideoSection(video, "Later", 90, 120, VideoSectionSource.COMMENT);
        VideoSection earlySection = new VideoSection(video, "Early", 0, 60, VideoSectionSource.YOUTUBE_CHAPTER);
        videoSectionRepository.saveAll(List.of(laterSection, earlySection));

        clip = new Clip(video, "Test Clip", 10, 30);
        clip.setTags(List.of("tag1", "tag2"));
        clipRepository.save(clip);

        playlist = new Playlist(user, "Favorites");
        playlist.setVisibility(Playlist.PlaylistVisibility.PUBLIC);
        playlist = playlistRepository.save(playlist);
    }

    @Test
    void playlistCrudFlow() throws Exception {
        mockMvc.perform(get("/api/playlists")
                        .header("X-User-Email", user.getEmail())
                        .header("X-User-Name", user.getDisplayName()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].title").value("Favorites"))
                .andExpect(jsonPath("$[0].items", hasSize(0)));

        MvcResult addVideoResult = mockMvc.perform(post("/api/playlists/{id}/items", playlist.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-User-Email", user.getEmail())
                        .header("X-User-Name", user.getDisplayName())
                        .content(objectMapper.writeValueAsString(Map.of("videoId", video.getId()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(1)))
                .andExpect(jsonPath("$.items[0].type").value("video"))
                .andExpect(jsonPath("$.items[0].video.id").value(video.getId()))
                .andExpect(jsonPath("$.items[0].video.sections", hasSize(2)))
                .andExpect(jsonPath("$.items[0].video.sections[0].title").value("Early"))
                .andExpect(jsonPath("$.items[0].video.sections[1].title").value("Later"))
                .andReturn();

        JsonNode playlistAfterVideo = objectMapper.readTree(addVideoResult.getResponse().getContentAsString());
        long videoItemId = playlistAfterVideo.get("items").get(0).get("id").asLong();
        assertThat(videoItemId).isPositive();

        MvcResult addClipResult = mockMvc.perform(post("/api/playlists/{id}/items", playlist.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-User-Email", user.getEmail())
                        .header("X-User-Name", user.getDisplayName())
                        .content(objectMapper.writeValueAsString(Map.of("clipId", clip.getId()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(2)))
                .andExpect(jsonPath("$.items[1].type").value("clip"))
                .andExpect(jsonPath("$.items[1].clip.id").value(clip.getId()))
                .andExpect(jsonPath("$.items[1].ordering").value(2))
                .andExpect(jsonPath("$.items[0].video.sections", hasSize(2)))
                .andReturn();

        JsonNode playlistAfterClip = objectMapper.readTree(addClipResult.getResponse().getContentAsString());
        long clipItemId = playlistAfterClip.get("items").get(1).get("id").asLong();
        assertThat(clipItemId).isPositive();

        mockMvc.perform(delete("/api/playlists/{playlistId}/items/{itemId}", playlist.getId(), clipItemId)
                        .header("X-User-Email", user.getEmail())
                        .header("X-User-Name", user.getDisplayName()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(1)))
                .andExpect(jsonPath("$.items[0].id").value(videoItemId));

        mockMvc.perform(get("/api/public/clips"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].id").value(playlist.getId()))
                .andExpect(jsonPath("$[0].items", hasSize(1)))
                .andExpect(jsonPath("$[0].items[0].type").value("video"))
                .andExpect(jsonPath("$[0].items[0].video.sections", hasSize(2)))
                .andExpect(jsonPath("$[0].items[0].video.sections[0].title").value("Early"));
    }
}
