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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
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

        Map<String, String> localizedNames = createLocalizedNameMap(
                request.names(),
                request.nameKo(),
                request.nameEn(),
                request.nameJp());
        if (localizedNames.isEmpty()) {
            throw new IllegalArgumentException("At least one name must be provided");
        }

        String primaryName = determinePrimaryName(localizedNames, request.names());
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
        applyLocalizedNames(artist, localizedNames);
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
                                        String nameKo,
                                        String nameEn,
                                        String nameJp,
                                        List<LocalizedTextRequest> names,
                                        UserAccount user) {
        Artist artist = artistRepository.findById(artistId)
                .orElseThrow(() -> new EntityNotFoundException("Artist not found: " + artistId));

        artist.setTags(normalizeTags(tags));
        artist.setAgency(trimToNull(agency));
        boolean updatesLocalizedNames = names != null || nameKo != null || nameEn != null || nameJp != null;
        if (updatesLocalizedNames) {
            Map<String, String> localizedNames;
            if (names != null) {
                localizedNames = createLocalizedNameMap(names, null, null, null);
            } else {
                localizedNames = toLocalizedNameMap(artist.getNames());
            }
            localizedNames = new LinkedHashMap<>(localizedNames);

            applyLocalizedOverride(localizedNames, "ko", nameKo);
            applyLocalizedOverride(localizedNames, "en", nameEn);
            applyLocalizedOverride(localizedNames, "ja", nameJp);

            applyLocalizedNames(artist, localizedNames);

            if (!localizedNames.isEmpty()) {
                String primaryName = determinePrimaryName(localizedNames, names);
                if (primaryName != null) {
                    artist.setName(primaryName);
                    artist.setDisplayName(primaryName);
                }
            }
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
                resolved.getNameKo(),
                resolved.getNameEn(),
                resolved.getNameJp(),
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

    private void applyLocalizedNames(Artist artist, Map<String, String> localizedNames) {
        artist.setNameKo(localizedNames.get("ko"));
        artist.setNameEn(localizedNames.get("en"));
        artist.setNameJp(localizedNames.get("ja"));
        artist.setNames(toArtistNames(artist, localizedNames));
    }

    private List<LocalizedTextResponse> mapNames(List<ArtistName> names) {
        if (names == null || names.isEmpty()) {
            return List.of();
        }
        return names.stream()
                .map(name -> new LocalizedTextResponse(name.getLanguageCode(), name.getValue(), name.getNormalizedValue()))
                .collect(Collectors.toList());
    }

    private List<ArtistName> toArtistNames(Artist artist, Map<String, String> localizedNames) {
        if (localizedNames == null || localizedNames.isEmpty()) {
            return List.of();
        }
        return localizedNames.entrySet().stream()
                .filter(entry -> entry.getValue() != null && !entry.getValue().isBlank())
                .map(entry -> new ArtistName(artist, normalizeLanguageCode(entry.getKey()), entry.getValue().trim()))
                .collect(Collectors.toList());
    }

    private Map<String, String> createLocalizedNameMap(List<LocalizedTextRequest> names,
                                                       String nameKo,
                                                       String nameEn,
                                                       String nameJp) {
        Map<String, String> localizedNames = new LinkedHashMap<>();
        if (names != null) {
            for (LocalizedTextRequest name : names) {
                if (name == null || name.value() == null || name.value().isBlank()) {
                    continue;
                }
                String language = normalizeLanguageCode(name.languageCode());
                localizedNames.put(language, name.value().trim());
            }
        }
        applyLocalizedOverride(localizedNames, "ko", nameKo);
        applyLocalizedOverride(localizedNames, "en", nameEn);
        applyLocalizedOverride(localizedNames, "ja", nameJp);
        return localizedNames;
    }

    private Map<String, String> toLocalizedNameMap(List<ArtistName> names) {
        Map<String, String> map = new LinkedHashMap<>();
        if (names != null) {
            for (ArtistName name : names) {
                if (name.getValue() != null) {
                    map.put(normalizeLanguageCode(name.getLanguageCode()), name.getValue());
                }
            }
        }
        return map;
    }

    private void applyLocalizedOverride(Map<String, String> localizedNames, String languageCode, String value) {
        if (localizedNames == null) {
            return;
        }
        String trimmed = trimToNull(value);
        if (trimmed == null) {
            localizedNames.remove(languageCode);
        } else {
            localizedNames.put(languageCode, trimmed);
        }
    }

    private String determinePrimaryName(Map<String, String> localizedNames, List<LocalizedTextRequest> fallbackNames) {
        if (localizedNames != null) {
            if (localizedNames.containsKey("ko")) {
                return localizedNames.get("ko");
            }
            if (localizedNames.containsKey("en")) {
                return localizedNames.get("en");
            }
            if (localizedNames.containsKey("ja")) {
                return localizedNames.get("ja");
            }
            if (!localizedNames.isEmpty()) {
                return localizedNames.values().iterator().next();
            }
        }
        if (fallbackNames != null) {
            for (LocalizedTextRequest name : fallbackNames) {
                if (name != null && name.value() != null && !name.value().trim().isEmpty()) {
                    return name.value().trim();
                }
            }
        }
        return null;
    }

    private String normalizeLanguageCode(String languageCode) {
        if (languageCode == null) {
            return "und";
        }
        String trimmed = languageCode.trim();
        if (trimmed.isEmpty()) {
            return "und";
        }
        String normalized = trimmed.toLowerCase(Locale.ROOT);
        if ("jp".equals(normalized)) {
            return "ja";
        }
        return normalized;
    }

    private String normalizeName(String value) {
        return com.example.youtube.util.TextNormalizer.normalize(value);
    }
}
