package com.example.youtube.model;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

@Entity
@Table(name = "playlists", uniqueConstraints = @UniqueConstraint(columnNames = {"owner_id", "title"}))
public class Playlist {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_id")
    private UserAccount owner;

    @Column(nullable = false)
    private String title;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private PlaylistVisibility visibility = PlaylistVisibility.PRIVATE;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @OneToMany(mappedBy = "playlist", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<PlaylistItem> items = new ArrayList<>();

    public Playlist() {
    }

    public Playlist(UserAccount owner, String title) {
        this.owner = owner;
        this.title = title;
    }

    @PrePersist
    public void prePersist() {
        Instant now = Instant.now();
        if (createdAt == null) {
            createdAt = now;
        }
        updatedAt = now;
    }

    @PreUpdate
    public void preUpdate() {
        updatedAt = Instant.now();
    }

    public Long getId() {
        return id;
    }

    public UserAccount getOwner() {
        return owner;
    }

    public void setOwner(UserAccount owner) {
        this.owner = owner;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
        touch();
    }

    public PlaylistVisibility getVisibility() {
        return visibility;
    }

    public void setVisibility(PlaylistVisibility visibility) {
        this.visibility = visibility == null ? PlaylistVisibility.PRIVATE : visibility;
        touch();
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public List<PlaylistItem> getItems() {
        if (items == null) {
            items = new ArrayList<>();
        }
        return items;
    }

    public void addItem(PlaylistItem item) {
        getItems().add(item);
        item.setPlaylist(this);
        touch();
    }

    public void removeItem(PlaylistItem item) {
        getItems().remove(item);
        item.setPlaylist(null);
        touch();
    }

    public int nextOrdering() {
        return getItems().stream()
                .map(PlaylistItem::getOrdering)
                .max(Comparator.naturalOrder())
                .orElse(0) + 1;
    }

    public List<PlaylistItem> getItemsInOrder() {
        List<PlaylistItem> copy = new ArrayList<>(getItems());
        copy.sort(Comparator.comparingInt(PlaylistItem::getOrdering).thenComparing(item -> item.getId() == null ? 0L : item.getId()));
        return Collections.unmodifiableList(copy);
    }

    private void touch() {
        updatedAt = Instant.now();
    }

    public enum PlaylistVisibility {
        PRIVATE,
        UNLISTED,
        PUBLIC
    }
}
