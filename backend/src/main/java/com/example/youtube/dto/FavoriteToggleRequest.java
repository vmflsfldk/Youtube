package com.example.youtube.dto;

import jakarta.validation.constraints.NotNull;

public record FavoriteToggleRequest(@NotNull Long artistId) {
}
