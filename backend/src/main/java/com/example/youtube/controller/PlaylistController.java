package com.example.youtube.controller;

import com.example.youtube.dto.PlaylistItemRequest;
import com.example.youtube.dto.PlaylistResponse;
import com.example.youtube.model.UserAccount;
import com.example.youtube.service.PlaylistService;
import com.example.youtube.config.UserRequestInterceptor;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class PlaylistController {

    private final PlaylistService playlistService;

    public PlaylistController(PlaylistService playlistService) {
        this.playlistService = playlistService;
    }

    @GetMapping("/playlists")
    public List<PlaylistResponse> listUserPlaylists(
            @RequestAttribute(UserRequestInterceptor.CURRENT_USER_ATTR) UserAccount user) {
        return playlistService.getUserPlaylists(user);
    }

    @GetMapping("/public/clips")
    public List<PlaylistResponse> listPublicPlaylists() {
        return playlistService.getPublicClipPlaylists();
    }

    @PostMapping("/playlists/{playlistId}/items")
    public PlaylistResponse addPlaylistItem(@PathVariable("playlistId") Long playlistId,
                                            @Valid @RequestBody PlaylistItemRequest request,
                                            @RequestAttribute(UserRequestInterceptor.CURRENT_USER_ATTR) UserAccount user) {
        return playlistService.addItem(playlistId, request, user);
    }

    @DeleteMapping("/playlists/{playlistId}/items/{itemId}")
    public PlaylistResponse removePlaylistItem(@PathVariable("playlistId") Long playlistId,
                                               @PathVariable("itemId") Long itemId,
                                               @RequestAttribute(UserRequestInterceptor.CURRENT_USER_ATTR) UserAccount user) {
        return playlistService.removeItem(playlistId, itemId, user);
    }
}
