package com.example.youtube.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertEquals;

import com.example.youtube.dto.ClipCreateRequest;
import com.example.youtube.dto.LocalizedTextRequest;
import com.example.youtube.model.Artist;
import com.example.youtube.model.Clip;
import com.example.youtube.model.UserAccount;
import com.example.youtube.model.Video;
import com.example.youtube.repository.ArtistRepository;
import com.example.youtube.repository.ClipRepository;
import com.example.youtube.repository.UserAccountRepository;
import com.example.youtube.repository.VideoRepository;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@Transactional
class ClipServiceTest {

    @Autowired
    private ClipService clipService;

    @Autowired
    private ClipRepository clipRepository;

    @Autowired
    private UserAccountRepository userAccountRepository;

    @Autowired
    private ArtistRepository artistRepository;

    @Autowired
    private VideoRepository videoRepository;

    private Video video;

    @BeforeEach
    void setUp() {
        UserAccount user = userAccountRepository.save(new UserAccount("alice@example.com", "Alice"));

        Artist artist = new Artist("Sample Artist", "샘플", "channel-xyz", user, true, true, true);
        artistRepository.save(artist);

        video = new Video(artist, "video-xyz", "Sample Video");
        videoRepository.save(video);
    }

    @Test
    void createClipPersistsPrimaryTitleAndComposerFromLocalizedFields() {
        ClipCreateRequest request = new ClipCreateRequest(
                video.getId(),
                List.of(
                        new LocalizedTextRequest("und", "  Primary Title "),
                        new LocalizedTextRequest("ko", "보조 제목")),
                5,
                15,
                List.of("tag1", "tag2"),
                null,
                List.of(new LocalizedTextRequest("en", "  Composer Name ")));

        var response = clipService.create(request);

        Clip saved = clipRepository.findById(response.id()).orElseThrow();

        assertEquals("Primary Title", saved.getTitle());
        assertEquals("Primary Title", response.title());
        assertEquals("Composer Name", saved.getOriginalComposer());
        assertEquals("Composer Name", response.originalComposer());
        assertThat(saved.getTitles()).hasSize(2);
        assertThat(saved.getComposerNames()).hasSize(1);
        assertThat(saved.getTitles().get(0).getValue()).isEqualTo("Primary Title");
        assertThat(saved.getComposerNames().get(0).getValue()).isEqualTo("Composer Name");
    }
}

