package com.example.youtube.service;

import com.example.youtube.dto.ArtistRequest;
import com.example.youtube.dto.ArtistResponse;
import com.example.youtube.model.Artist;
import com.example.youtube.model.UserAccount;
import com.example.youtube.repository.ArtistRepository;
import com.example.youtube.repository.UserAccountRepository;
import jakarta.persistence.EntityNotFoundException;
import java.util.List;
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

        String displayName = request.displayName();
        if (displayName == null || displayName.isBlank()) {
            if (metadataTitle != null && !metadataTitle.isBlank()) {
                displayName = metadataTitle;
            } else {
                displayName = request.name();
            }
        }

        Artist artist = new Artist(
                request.name(),
                displayName,
                request.youtubeChannelId(),
                creator,
                request.availableKo(),
                request.availableEn(),
                request.availableJp());
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
    public ArtistResponse updateTags(Long artistId, List<String> tags, UserAccount user) {
        Artist artist = artistRepository.findById(artistId)
                .orElseThrow(() -> new EntityNotFoundException("Artist not found: " + artistId));

        artist.setTags(normalizeTags(tags));
        Artist saved = artistRepository.save(artist);
        return map(saved);
    }

    @Transactional
    public List<ArtistResponse> listMine(UserAccount user) {
        return user.getFavoriteArtists().stream()
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

        List<Artist> artists = artistRepository.search(trimmedName, trimmedTag);
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
                List.copyOf(resolved.getTags()));
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
}
