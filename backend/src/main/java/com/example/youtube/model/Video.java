package com.example.youtube.model;

import jakarta.persistence.*;

@Entity
@Table(name = "videos")
public class Video {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "artist_id")
    private Artist artist;

    @Column(name = "youtube_video_id", nullable = false, unique = true)
    private String youtubeVideoId;

    @Column(nullable = false)
    private String title;

    @Column(name = "duration_sec")
    private Integer durationSec;

    @Column(name = "thumbnail_url")
    private String thumbnailUrl;

    @Column(name = "channel_id")
    private String channelId;

    @Lob
    private String description;

    @Lob
    @Column(name = "captions_json")
    private String captionsJson;

    @Column(name = "category")
    private String category;

    @Column(name = "original_composer")
    private String originalComposer;

    @OneToMany(mappedBy = "video", cascade = CascadeType.ALL, orphanRemoval = true)
    private java.util.List<SongTitle> titles = new java.util.ArrayList<>();

    @OneToMany(mappedBy = "video", cascade = CascadeType.ALL, orphanRemoval = true)
    private java.util.List<ComposerName> composerNames = new java.util.ArrayList<>();

    public Video() {
    }

    public Video(Artist artist, String youtubeVideoId, String title) {
        this.artist = artist;
        this.youtubeVideoId = youtubeVideoId;
        this.title = title;
    }

    public Long getId() {
        return id;
    }

    public Artist getArtist() {
        return artist;
    }

    public void setArtist(Artist artist) {
        this.artist = artist;
    }

    public String getYoutubeVideoId() {
        return youtubeVideoId;
    }

    public void setYoutubeVideoId(String youtubeVideoId) {
        this.youtubeVideoId = youtubeVideoId;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public Integer getDurationSec() {
        return durationSec;
    }

    public void setDurationSec(Integer durationSec) {
        this.durationSec = durationSec;
    }

    public String getThumbnailUrl() {
        return thumbnailUrl;
    }

    public void setThumbnailUrl(String thumbnailUrl) {
        this.thumbnailUrl = thumbnailUrl;
    }

    public String getChannelId() {
        return channelId;
    }

    public void setChannelId(String channelId) {
        this.channelId = channelId;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getCaptionsJson() {
        return captionsJson;
    }

    public void setCaptionsJson(String captionsJson) {
        this.captionsJson = captionsJson;
    }

    public String getCategory() {
        return category;
    }

    public void setCategory(String category) {
        this.category = category;
    }

    public String getOriginalComposer() {
        return originalComposer;
    }

    public void setOriginalComposer(String originalComposer) {
        this.originalComposer = originalComposer;
    }

    public java.util.List<SongTitle> getTitles() {
        if (titles == null) {
            titles = new java.util.ArrayList<>();
        }
        return titles;
    }

    public void setTitles(java.util.List<SongTitle> titles) {
        getTitles().clear();
        if (titles != null) {
            for (SongTitle title : titles) {
                addTitle(title);
            }
        }
    }

    public void addTitle(SongTitle title) {
        if (title == null) {
            return;
        }
        title.setVideo(this);
        title.setClip(null);
        getTitles().add(title);
    }

    public java.util.List<ComposerName> getComposerNames() {
        if (composerNames == null) {
            composerNames = new java.util.ArrayList<>();
        }
        return composerNames;
    }

    public void setComposerNames(java.util.List<ComposerName> composerNames) {
        getComposerNames().clear();
        if (composerNames != null) {
            for (ComposerName composerName : composerNames) {
                addComposerName(composerName);
            }
        }
    }

    public void addComposerName(ComposerName composerName) {
        if (composerName == null) {
            return;
        }
        composerName.setVideo(this);
        composerName.setClip(null);
        getComposerNames().add(composerName);
    }
}
