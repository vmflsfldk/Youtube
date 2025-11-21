package com.example.youtube.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.youtube.dto.ArtistRequest;
import com.example.youtube.dto.ArtistResponse;
import com.example.youtube.dto.LocalizedTextRequest;
import com.example.youtube.model.Artist;
import com.example.youtube.model.ArtistName;
import com.example.youtube.model.UserAccount;
import com.example.youtube.repository.ArtistRepository;
import com.example.youtube.repository.UserAccountRepository;
import java.util.List;
import java.util.Optional;
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
                "테스트 아티스트",
                "Test Artist",
                "テストアーティスト",
                List.of(
                        new LocalizedTextRequest("en", "Different Value"),
                        new LocalizedTextRequest("zh", "测试艺术家")),
                "channel-123",
                "chzzk-123",
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
        assertThat(saved.getNameKo()).isEqualTo("테스트 아티스트");
        assertThat(saved.getNameEn()).isEqualTo("Test Artist");
        assertThat(saved.getNameJp()).isEqualTo("テストアーティスト");
        assertThat(saved.getNames())
                .extracting(ArtistName::getLanguageCode)
                .containsExactlyInAnyOrder("ko", "en", "ja", "zh");
        assertThat(saved.getNames())
                .anySatisfy(name -> {
                    if ("en".equals(name.getLanguageCode())) {
                        assertThat(name.getValue()).isEqualTo("Test Artist");
                    }
                });

        assertThat(response.agency()).isEqualTo("Agency Name");
        assertThat(response.tags()).containsExactly("TagOne", "TagTwo", "tag-three");
        assertThat(response.nameKo()).isEqualTo("테스트 아티스트");
        assertThat(response.nameEn()).isEqualTo("Test Artist");
        assertThat(response.nameJp()).isEqualTo("テストアーティスト");
        assertThat(response.names()).hasSize(4);
        assertThat(response.chzzkChannelId()).isEqualTo("chzzk-123");
    }

    @Test
    void updateProfileUpdatesLocalizedNames() {
        UserAccount creator = new UserAccount("user@example.com", "User");
        Artist existing = new Artist("Original", "Original", "channel-123", creator, true, true, true);
        existing.setNameKo("기존 이름");
        existing.setNameEn("Original");
        existing.setNameJp("オリジナル");
        existing.addName(new ArtistName(existing, "ko", "기존 이름"));
        existing.addName(new ArtistName(existing, "en", "Original"));
        existing.addName(new ArtistName(existing, "ja", "オリジナル"));

        when(artistRepository.findById(1L)).thenReturn(Optional.of(existing));
        when(artistRepository.save(any(Artist.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(channelMetadataProvider.fetch("channel-123"))
                .thenReturn(new ChannelMetadata(null, null));

        ArtistResponse response = artistService.updateProfile(
                1L,
                List.of("Tag"),
                " Agency ",
                "새 이름",
                "New Name",
                "新しい名前",
                List.of(new LocalizedTextRequest("zh", "새로운 예술가")),
                " chzzk-123 ",
                creator);

        assertThat(existing.getAgency()).isEqualTo("Agency");
        assertThat(existing.getTags()).containsExactly("Tag");
        assertThat(existing.getNameKo()).isEqualTo("새 이름");
        assertThat(existing.getNameEn()).isEqualTo("New Name");
        assertThat(existing.getNameJp()).isEqualTo("新しい名前");
        assertThat(existing.getNames())
                .extracting(ArtistName::getLanguageCode)
                .containsExactlyInAnyOrder("ko", "en", "ja", "zh");
        assertThat(existing.getName()).isEqualTo("새 이름");
        assertThat(existing.getDisplayName()).isEqualTo("새 이름");
        assertThat(existing.getChzzkChannelId()).isEqualTo("chzzk-123");

        assertThat(response.nameKo()).isEqualTo("새 이름");
        assertThat(response.nameEn()).isEqualTo("New Name");
        assertThat(response.nameJp()).isEqualTo("新しい名前");
        assertThat(response.names()).hasSize(4);
    }
}
