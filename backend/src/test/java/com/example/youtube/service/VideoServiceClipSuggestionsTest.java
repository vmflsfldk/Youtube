package com.example.youtube.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.youtube.dto.ClipCandidateResponse;
import com.example.youtube.dto.VideoClipSuggestionsRequest;
import com.example.youtube.dto.VideoClipSuggestionsResponse;
import com.example.youtube.model.Artist;
import com.example.youtube.model.UserAccount;
import com.example.youtube.repository.ArtistRepository;
import com.example.youtube.repository.UserAccountRepository;
import com.example.youtube.repository.VideoRepository;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@Transactional
class VideoServiceClipSuggestionsTest {

    @Autowired
    private VideoService videoService;

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
        UserAccount user = userAccountRepository.save(new UserAccount("carol@example.com", "Carol"));
        artist = new Artist("Carol Artist", "캐롤", "channel-clip", user, true, true, true);
        artistRepository.save(artist);
    }

    @Test
    void registerAndSuggestCreatesVideoBeforeDetectingClips() {
        List<ClipCandidateResponse> expectedCandidates = List.of(new ClipCandidateResponse(0, 30, 0.7, "Intro"));

        when(clipAutoDetectionService.detect(anyLong(), eq("combined")))
                .thenAnswer(invocation -> {
                    Long videoId = invocation.getArgument(0);
                    assertThat(videoRepository.findById(videoId)).isPresent();
                    return expectedCandidates;
                });

        VideoClipSuggestionsRequest request = new VideoClipSuggestionsRequest(
                "https://www.youtube.com/watch?v=clipcreate1",
                artist.getId(),
                "Primary Composer");

        VideoClipSuggestionsResponse response = videoService.registerAndSuggest(request);

        assertThat(response.video()).isNotNull();
        assertThat(response.video().youtubeVideoId()).isEqualTo("clipcreate1");
        assertThat(response.candidates()).isEqualTo(expectedCandidates);
        assertThat(response.status()).isEqualTo("created");
        assertThat(response.created()).isTrue();
        assertThat(response.reused()).isFalse();
        assertThat(videoRepository.findByYoutubeVideoId("clipcreate1")).isPresent();

        verify(clipAutoDetectionService).detect(response.video().id(), "combined");
        Mockito.verifyNoMoreInteractions(clipAutoDetectionService);
    }
}
