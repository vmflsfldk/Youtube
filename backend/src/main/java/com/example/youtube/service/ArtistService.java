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

    public ArtistService(ArtistRepository artistRepository, UserAccountRepository userAccountRepository) {
        this.artistRepository = artistRepository;
        this.userAccountRepository = userAccountRepository;
    }

    @Transactional
    public ArtistResponse createArtist(ArtistRequest request, UserAccount creator) {
        Artist artist = new Artist(request.name(), request.youtubeChannelId(), creator);
        Artist saved = artistRepository.save(artist);
        return map(saved);
    }

    @Transactional(readOnly = true)
    public List<ArtistResponse> listMine(UserAccount user) {
        return user.getFavoriteArtists().stream()
                .map(this::map)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
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

    private ArtistResponse map(Artist artist) {
        return new ArtistResponse(artist.getId(), artist.getName(), artist.getYoutubeChannelId());
    }
}
