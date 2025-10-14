package com.example.youtube.controller;

import com.example.youtube.config.UserRequestInterceptor;
import com.example.youtube.dto.ArtistRequest;
import com.example.youtube.dto.ArtistResponse;
import com.example.youtube.dto.FavoriteToggleRequest;
import com.example.youtube.model.UserAccount;
import com.example.youtube.service.ArtistService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class ArtistController {

    private final ArtistService artistService;

    public ArtistController(ArtistService artistService) {
        this.artistService = artistService;
    }

    @PostMapping("/artists")
    public ArtistResponse createArtist(@Valid @RequestBody ArtistRequest request,
                                       @RequestAttribute(UserRequestInterceptor.CURRENT_USER_ATTR) UserAccount user) {
        return artistService.createArtist(request, user);
    }

    @GetMapping("/artists")
    public List<ArtistResponse> listArtists(@RequestParam(value = "mine", defaultValue = "false") boolean mine,
                                            @RequestAttribute(UserRequestInterceptor.CURRENT_USER_ATTR) UserAccount user) {
        return mine ? artistService.listMine(user) : artistService.listCreatedBy(user);
    }

    @PostMapping("/users/me/favorites")
    public void toggleFavorite(@Valid @RequestBody FavoriteToggleRequest request,
                               @RequestAttribute(UserRequestInterceptor.CURRENT_USER_ATTR) UserAccount user) {
        artistService.toggleFavorite(request.artistId(), user);
    }
}
