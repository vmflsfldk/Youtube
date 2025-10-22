package com.example.youtube.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.youtube.dto.ArtistRequest;
import com.example.youtube.dto.ArtistResponse;
import com.example.youtube.dto.LocalizedTextRequest;
import com.example.youtube.model.Artist;
import com.example.youtube.model.UserAccount;
import com.example.youtube.repository.ArtistRepository;
import com.example.youtube.repository.UserAccountRepository;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ArtistServiceTest {

    @Mock
    private ArtistRepository artistRepository;

    @Mock
    private UserAccountRepository userAccountRepository;

    @Mock
    private YouTubeChannelMetadataProvider channelMetadataProvider;

    private ArtistService artistService;

    @BeforeEach
    void setUp() {
        artistService = new ArtistService(artistRepository, userAccountRepository, channelMetadataProvider);
    }

    @Test
    void createArtistAppliesAgencyAndTagsNormalization() {
        ArtistRequest request = new ArtistRequest(
                List.of(
                        new LocalizedTextRequest("en", "Test Artist"),
                        new LocalizedTextRequest("ko", "테스트 아티스트")),
                "channel-123",
                true,
                false,
                true,
                List.of("  TagOne  ", "TagTwo", "tag-three"),
                "  Agency Name  ");
        UserAccount creator = new UserAccount("test@example.com", "Tester");

        when(channelMetadataProvider.fetch("channel-123"))
                .thenReturn(new ChannelMetadata("Channel Title", "https://example.com/image.png"));
        when(artistRepository.save(any(Artist.class))).thenAnswer(invocation -> invocation.getArgument(0));

        ArtistResponse response = artistService.createArtist(request, creator);

        ArgumentCaptor<Artist> artistCaptor = ArgumentCaptor.forClass(Artist.class);
        verify(artistRepository).save(artistCaptor.capture());
        Artist saved = artistCaptor.getValue();

        assertThat(saved.getAgency()).isEqualTo("Agency Name");
        assertThat(saved.getTags()).containsExactly("TagOne", "TagTwo", "tag-three");
        assertThat(saved.getNames()).hasSize(2);
        assertThat(saved.getNames().get(0).getLanguageCode()).isEqualTo("en");
        assertThat(saved.getNames().get(0).getNormalizedValue()).isEqualTo("test artist");

        assertThat(response.agency()).isEqualTo("Agency Name");
        assertThat(response.tags()).containsExactly("TagOne", "TagTwo", "tag-three");
        assertThat(response.names()).hasSize(2);
    }
}
