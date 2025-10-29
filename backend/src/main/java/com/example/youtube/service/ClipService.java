package com.example.youtube.service;

import com.example.youtube.dto.ClipCreateRequest;
import com.example.youtube.dto.ClipResponse;
import com.example.youtube.dto.ClipUpdateRequest;
import com.example.youtube.dto.LocalizedTextRequest;
import com.example.youtube.dto.LocalizedTextResponse;
import com.example.youtube.dto.VideoArtistResponse;
import com.example.youtube.model.Artist;
import com.example.youtube.model.Clip;
import com.example.youtube.model.ComposerName;
import com.example.youtube.model.SongTitle;
import com.example.youtube.model.Video;
import com.example.youtube.repository.ArtistRepository;
import com.example.youtube.repository.ClipRepository;
import com.example.youtube.repository.VideoRepository;
import jakarta.persistence.EntityNotFoundException;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ClipService {

    private final ClipRepository clipRepository;
    private final VideoRepository videoRepository;
    private final ArtistRepository artistRepository;

    public ClipService(ClipRepository clipRepository,
                       VideoRepository videoRepository,
                       ArtistRepository artistRepository) {
        this.clipRepository = clipRepository;
        this.videoRepository = videoRepository;
        this.artistRepository = artistRepository;
    }

    @Transactional
    public ClipResponse create(ClipCreateRequest request) {
        Video video = videoRepository.findById(request.videoId())
                .orElseThrow(() -> new EntityNotFoundException("Video not found: " + request.videoId()));

        if (request.endSec() <= request.startSec()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "endSec must be greater than startSec");
        }

        if (clipRepository.existsByVideoAndStartSecAndEndSec(video, request.startSec(), request.endSec())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "A clip with the same time range already exists for this video");
        }

        Clip clip = new Clip(video, "", request.startSec(), request.endSec());
        clip.setTitles(toClipSongTitles(clip, request.titles()));
        if (!clip.getTitles().isEmpty()) {
            clip.setTitle(clip.getTitles().get(0).getValue());
        }
        if (request.tags() != null) {
            clip.setTags(request.tags());
        }
        clip.setComposerNames(toClipComposerNames(clip, request.originalComposers()));
        if (!clip.getComposerNames().isEmpty()) {
            clip.setOriginalComposer(clip.getComposerNames().get(0).getValue());
        } else {
            clip.setOriginalComposer(null);
        }
        Clip saved = clipRepository.save(clip);
        return map(saved);
    }

    @Transactional(readOnly = true)
    public List<ClipResponse> listByArtist(Long artistId) {
        Artist artist = artistRepository.findById(artistId)
                .orElseThrow(() -> new EntityNotFoundException("Artist not found: " + artistId));
        return clipRepository.findByArtistWithTags(artist).stream()
                .map(this::map)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<ClipResponse> listAll() {
        return clipRepository.findAllWithTags().stream()
                .map(this::map)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<ClipResponse> listByVideo(Long videoId) {
        Video video = videoRepository.findById(videoId)
                .orElseThrow(() -> new EntityNotFoundException("Video not found: " + videoId));
        return clipRepository.findByVideoWithTags(video).stream()
                .map(this::map)
                .collect(Collectors.toList());
    }

    @Transactional
    public ClipResponse update(Long clipId, ClipUpdateRequest request) {
        Clip clip = clipRepository.findById(clipId)
                .orElseThrow(() -> new EntityNotFoundException("Clip not found: " + clipId));

        Video video = clip.getVideo();
        Artist artist = video.getArtist();
        if (artist == null) {
            throw new EntityNotFoundException("Artist not found for clip: " + clipId);
        }

        int startSec = request.startSec();
        int endSec = request.endSec();

        if (endSec <= startSec) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "endSec must be greater than startSec");
        }

        if (clipRepository.existsByVideoAndStartSecAndEndSecAndIdNot(video, startSec, endSec, clipId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "A clip with the same time range already exists for this video");
        }

        clip.setStartSec(startSec);
        clip.setEndSec(endSec);

        if (request.titles() != null) {
            clip.setTitles(toClipSongTitles(clip, request.titles()));
            if (!clip.getTitles().isEmpty()) {
                clip.setTitle(clip.getTitles().get(0).getValue());
            }
        }

        if (request.originalComposers() != null) {
            clip.setComposerNames(toClipComposerNames(clip, request.originalComposers()));
            if (!clip.getComposerNames().isEmpty()) {
                clip.setOriginalComposer(clip.getComposerNames().get(0).getValue());
            } else {
                clip.setOriginalComposer(null);
            }
        }

        Clip saved = clipRepository.save(clip);
        return map(saved);
    }

    private ClipResponse map(Clip clip) {
        Video video = clip.getVideo();
        Artist artist = video != null ? video.getArtist() : null;
        Long videoId = video != null ? video.getId() : null;
        Long artistId = artist != null ? artist.getId() : null;
        List<VideoArtistResponse> artists = artist != null
                ? List.of(mapArtist(artist, true))
                : List.of();

        List<String> tags = clip.getTags() == null ? List.of() : clip.getTags();

        return new ClipResponse(clip.getId(),
                videoId,
                clip.getTitle(),
                clip.getStartSec(),
                clip.getEndSec(),
                tags,
                clip.getOriginalComposer(),
                video != null ? video.getYoutubeVideoId() : null,
                video != null ? video.getTitle() : null,
                video != null ? video.getOriginalComposer() : null,
                artistId,
                artistId,
                artist != null ? artist.getName() : null,
                artist != null ? defaultDisplayName(artist) : null,
                artist != null ? artist.getYoutubeChannelId() : null,
                artist != null ? artist.getYoutubeChannelTitle() : null,
                artist != null ? artist.getProfileImageUrl() : null,
                artists,
                mapSongTitles(clip.getTitles()),
                mapComposerNames(clip.getComposerNames()),
                null,
                null);
    }

    private VideoArtistResponse mapArtist(Artist artist, boolean primary) {
        if (artist == null) {
            return null;
        }
        return new VideoArtistResponse(artist.getId(),
                artist.getName(),
                defaultDisplayName(artist),
                artist.getYoutubeChannelId(),
                artist.getYoutubeChannelTitle(),
                artist.getProfileImageUrl(),
                primary);
    }

    private String defaultDisplayName(Artist artist) {
        if (artist == null) {
            return null;
        }
        if (artist.getDisplayName() != null && !artist.getDisplayName().isBlank()) {
            return artist.getDisplayName();
        }
        return artist.getName();
    }

    private List<SongTitle> toClipSongTitles(Clip clip, List<LocalizedTextRequest> titles) {
        if (titles == null) {
            return List.of();
        }
        return titles.stream()
                .filter(title -> title != null && title.value() != null && !title.value().isBlank())
                .map(title -> new SongTitle(null, clip, normalizeLanguageCode(title.languageCode()), title.value().trim()))
                .collect(Collectors.toList());
    }

    private List<ComposerName> toClipComposerNames(Clip clip, List<LocalizedTextRequest> composers) {
        if (composers == null) {
            return List.of();
        }
        return composers.stream()
                .filter(composer -> composer != null && composer.value() != null && !composer.value().isBlank())
                .map(composer -> new ComposerName(null, clip,
                        normalizeLanguageCode(composer.languageCode()), composer.value().trim()))
                .collect(Collectors.toList());
    }

    private List<LocalizedTextResponse> mapSongTitles(List<SongTitle> titles) {
        if (titles == null || titles.isEmpty()) {
            return List.of();
        }
        return titles.stream()
                .map(title -> new LocalizedTextResponse(title.getLanguageCode(), title.getValue(), title.getNormalizedValue()))
                .collect(Collectors.toList());
    }

    private List<LocalizedTextResponse> mapComposerNames(List<ComposerName> composers) {
        if (composers == null || composers.isEmpty()) {
            return List.of();
        }
        return composers.stream()
                .map(composer -> new LocalizedTextResponse(composer.getLanguageCode(),
                        composer.getValue(),
                        composer.getNormalizedValue()))
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
}
