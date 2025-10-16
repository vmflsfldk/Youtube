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

    @Column(name = "display_name")
    private String displayName;

    @Column(name = "youtube_channel_id", nullable = false)
    private String youtubeChannelId;

    @Column(name = "profile_image_url")
    private String profileImageUrl;

    @ManyToOne(optional = false)
    @JoinColumn(name = "created_by")
    private UserAccount createdBy;

    @Column(name = "available_ko", nullable = false)
    private boolean availableKo;

    @Column(name = "available_en", nullable = false)
    private boolean availableEn;

    @Column(name = "available_jp", nullable = false)
    private boolean availableJp;

    public Artist() {
    }

    public Artist(String name,
                  String displayName,
                  String youtubeChannelId,
                  UserAccount createdBy,
                  boolean availableKo,
                  boolean availableEn,
                  boolean availableJp) {
        this.name = name;
        this.displayName = displayName;
        this.youtubeChannelId = youtubeChannelId;
        this.createdBy = createdBy;
        this.availableKo = availableKo;
        this.availableEn = availableEn;
        this.availableJp = availableJp;
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

    public String getDisplayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
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

    public String getProfileImageUrl() {
        return profileImageUrl;
    }

    public void setProfileImageUrl(String profileImageUrl) {
        this.profileImageUrl = profileImageUrl;
    }

    public boolean isAvailableKo() {
        return availableKo;
    }

    public void setAvailableKo(boolean availableKo) {
        this.availableKo = availableKo;
    }

    public boolean isAvailableEn() {
        return availableEn;
    }

    public void setAvailableEn(boolean availableEn) {
        this.availableEn = availableEn;
    }

    public boolean isAvailableJp() {
        return availableJp;
    }

    public void setAvailableJp(boolean availableJp) {
        this.availableJp = availableJp;
    }
}
