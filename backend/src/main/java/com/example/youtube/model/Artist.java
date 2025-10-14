package com.example.youtube.model;

import jakarta.persistence.*;

@Entity
@Table(name = "artists")
public class Artist {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Column(name = "youtube_channel_id", nullable = false)
    private String youtubeChannelId;

    @ManyToOne(optional = false)
    @JoinColumn(name = "created_by")
    private UserAccount createdBy;

    public Artist() {
    }

    public Artist(String name, String youtubeChannelId, UserAccount createdBy) {
        this.name = name;
        this.youtubeChannelId = youtubeChannelId;
        this.createdBy = createdBy;
    }

    public Long getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getYoutubeChannelId() {
        return youtubeChannelId;
    }

    public void setYoutubeChannelId(String youtubeChannelId) {
        this.youtubeChannelId = youtubeChannelId;
    }

    public UserAccount getCreatedBy() {
        return createdBy;
    }

    public void setCreatedBy(UserAccount createdBy) {
        this.createdBy = createdBy;
    }
}
