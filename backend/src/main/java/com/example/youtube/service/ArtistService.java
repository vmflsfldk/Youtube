package com.example.youtube.service;

import com.example.youtube.dto.ArtistRequest;
import com.example.youtube.dto.ArtistResponse;
import com.example.youtube.dto.LocalizedTextRequest;
import com.example.youtube.dto.LocalizedTextResponse;
import com.example.youtube.model.Artist;
import com.example.youtube.model.ArtistName;
import com.example.youtube.model.UserAccount;
import com.example.youtube.repository.ArtistRepository;
import com.example.youtube.repository.UserAccountRepository;
import jakarta.persistence.EntityNotFoundException;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ArtistService {

    private final ArtistRepository artistRepository;
    private final UserAccountRepository userAccountRepository;
    private final YouTubeChannelMetadataProvider channelMetadataProvider;

    public ArtistService(ArtistRepository artistRepository,
                         UserAccountRepository userAccountRepository,
                         YouTubeChannelMetadataProvider channelMetadataProvider) {
        this.artistRepository = artistRepository;
        this.userAccountRepository = userAccountRepository;
        this.channelMetadataProvider = channelMetadataProvider;
    }

    @Transactional
    public ArtistResponse createArtist(ArtistRequest request, UserAccount creator) {
        ChannelMetadata channelMetadata = channelMetadataProvider.fetch(request.youtubeChannelId());
        String metadataTitle = channelMetadata.title();

        List<LocalizedTextRequest> nameRequests = request.names();
        if (nameRequests == null || nameRequests.isEmpty()) {
            throw new IllegalArgumentException("At least one name must be provided");
        }

        String primaryName = nameRequests.get(0).value().trim();
        String displayName = metadataTitle != null && !metadataTitle.isBlank() ? metadataTitle : primaryName;

        Artist artist = new Artist(
                primaryName,
                displayName,
                request.youtubeChannelId(),
                creator,
                request.availableKo(),
                request.availableEn(),
                request.availableJp());
        artist.setTags(normalizeTags(request.tags()));
        artist.setAgency(trimToNull(request.agency()));
        artist.setNames(toArtistNames(artist, nameRequests));
        String profileImageUrl = channelMetadata.profileImageUrl();
        if (metadataTitle != null && !metadataTitle.isBlank()) {
            artist.setYoutubeChannelTitle(metadataTitle);
        }
        if (profileImageUrl != null && !profileImageUrl.isBlank()) {
            artist.setProfileImageUrl(profileImageUrl);
        }
        Artist saved = artistRepository.save(artist);
        return map(saved);
    }

    @Transactional
    public ArtistResponse updateProfile(Long artistId,
                                        List<String> tags,
                                        String agency,
                                        List<LocalizedTextRequest> names,
                                        UserAccount user) {
        Artist artist = artistRepository.findById(artistId)
                .orElseThrow(() -> new EntityNotFoundException("Artist not found: " + artistId));

        artist.setTags(normalizeTags(tags));
        artist.setAgency(trimToNull(agency));
        if (names != null && !names.isEmpty()) {
            artist.setNames(toArtistNames(artist, names));
            String primaryName = names.get(0).value().trim();
            artist.setName(primaryName);
            artist.setDisplayName(primaryName);
        }
        Artist saved = artistRepository.save(artist);
        return map(saved);
    }

    @Transactional
    public List<ArtistResponse> listMine(UserAccount user) {
        return user.getFavoriteArtists().stream()
                .map(this::map)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<ArtistResponse> listAll() {
        return artistRepository.findAll().stream()
                .map(this::map)
                .collect(Collectors.toList());
    }

    @Transactional
    public List<ArtistResponse> listCreatedBy(UserAccount user) {
        return artistRepository.findByCreatedBy(user).stream()
                .map(this::map)
                .collect(Collectors.toList());
    }

    @Transactional
    public void toggleFavorite(Long artistId, UserAccount user) {
        Artist artist = artistRepository.findById(artistId)
                .orElseThrow(() -> new EntityNotFoundException("Artist not found: " + artistId));
        if (user.getFavoriteArtists().contains(artist)) {
            user.removeFavoriteArtist(artist);
        } else {
            user.addFavoriteArtist(artist);
        }
        userAccountRepository.save(user);
    }

    @Transactional(readOnly = true)
    public List<ArtistResponse> search(String name, String tag) {
        String trimmedName = trimToNull(name);
        String trimmedTag = trimToNull(tag);
        String normalized = trimmedName == null ? null : normalizeName(trimmedName);

        List<Artist> artists = artistRepository.search(trimmedName, trimmedTag, normalized);
        return artists.stream()
                .map(this::map)
                .collect(Collectors.toList());
    }

    private List<String> normalizeTags(List<String> tags) {
        if (tags == null) {
            return List.of();
        }
        return tags.stream()
                .map(tag -> tag == null ? null : tag.trim())
                .filter(tag -> tag != null && !tag.isBlank())
                .distinct()
                .collect(Collectors.toList());
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private ArtistResponse map(Artist artist) {
        Artist resolved = refreshMetadataIfNeeded(artist);
        List<String> tags = resolved.getTags();
        return new ArtistResponse(
                resolved.getId(),
                resolved.getName(),
                resolved.getDisplayName(),
                resolved.getYoutubeChannelId(),
                resolved.getYoutubeChannelTitle(),
                resolved.getProfileImageUrl(),
                resolved.isAvailableKo(),
                resolved.isAvailableEn(),
                resolved.isAvailableJp(),
                resolved.getAgency(),
                tags == null ? List.of() : List.copyOf(tags),
                mapNames(resolved.getNames()));
    }

    private Artist refreshMetadataIfNeeded(Artist artist) {
        boolean needsDisplayName = isBlank(artist.getDisplayName());
        boolean needsProfileImage = isBlank(artist.getProfileImageUrl());
        boolean needsChannelTitle = isBlank(artist.getYoutubeChannelTitle());

        if (!needsDisplayName && !needsProfileImage && !needsChannelTitle) {
            return artist;
        }

        String channelId = artist.getYoutubeChannelId();
        if (isBlank(channelId)) {
            return artist;
        }

        ChannelMetadata channelMetadata = channelMetadataProvider.fetch(channelId);
        boolean updated = false;

        String metadataTitle = channelMetadata.title();
        if (needsDisplayName && !isBlank(metadataTitle)) {
            artist.setDisplayName(metadataTitle);
            updated = true;
        }

        if (needsChannelTitle && !isBlank(metadataTitle)) {
            artist.setYoutubeChannelTitle(metadataTitle);
            updated = true;
        }

        if (needsProfileImage) {
            String profileImageUrl = channelMetadata.profileImageUrl();
            if (!isBlank(profileImageUrl)) {
                artist.setProfileImageUrl(profileImageUrl);
                updated = true;
            }
        }

        return updated ? artistRepository.save(artist) : artist;
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private List<ArtistName> toArtistNames(Artist artist, List<LocalizedTextRequest> names) {
        if (names == null) {
            return List.of();
        }
        return names.stream()
                .filter(name -> name != null && name.value() != null && !name.value().isBlank())
                .map(name -> new ArtistName(artist, normalizeLanguageCode(name.languageCode()), name.value().trim()))
                .collect(Collectors.toList());
    }

    private List<LocalizedTextResponse> mapNames(List<ArtistName> names) {
        if (names == null || names.isEmpty()) {
            return List.of();
        }
        return names.stream()
                .map(name -> new LocalizedTextResponse(name.getLanguageCode(), name.getValue(), name.getNormalizedValue()))
                .collect(Collectors.toList());
    }

    private String normalizeLanguageCode(String languageCode) {
        if (languageCode == null) {
            return "und";
        }
        String trimmed = languageCode.trim();
        if (trimmed.isEmpty()) {
            return "und";
        }
        return trimmed.toLowerCase(Locale.ROOT);
    }

    private String normalizeName(String value) {
        return com.example.youtube.util.TextNormalizer.normalize(value);
    }
}
