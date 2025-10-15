package com.example.youtube.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.HashSet;
import java.util.Set;

@Entity
@Table(name = "users")
public class UserAccount {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(name = "display_name")
    private String displayName;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @ManyToMany
    @JoinTable(
            name = "user_favorite_artists",
            joinColumns = @JoinColumn(name = "user_id"),
            inverseJoinColumns = @JoinColumn(name = "artist_id"),
            uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "artist_id"})
    )
    private Set<Artist> favoriteArtists = new HashSet<>();

    public UserAccount() {
    }

    public UserAccount(String email, String displayName) {
        this.email = email;
        this.displayName = displayName;
    }

    public Long getId() {
        return id;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getDisplayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Set<Artist> getFavoriteArtists() {
        return favoriteArtists;
    }

    public void addFavoriteArtist(Artist artist) {
        favoriteArtists.add(artist);
    }

    public void removeFavoriteArtist(Artist artist) {
        favoriteArtists.remove(artist);
    }
}
