package com.example.youtube.model;

import jakarta.persistence.*;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "clips")
public class Clip {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = true)
    @JoinColumn(name = "video_id")
    private Video video;

    @ManyToOne(optional = true)
    @JoinColumn(name = "artist_id")
    private Artist artist;

    @Column(name = "youtube_video_id", nullable = false)
    private String youtubeVideoId;

    @Column(nullable = false)
    private String title;

    @Column(name = "start_sec", nullable = false)
    private int startSec;

    @Column(name = "end_sec", nullable = false)
    private int endSec;

    @ElementCollection
    @CollectionTable(name = "clip_tags", joinColumns = @JoinColumn(name = "clip_id"))
    @Column(name = "tag")
    private List<String> tags = new ArrayList<>();

    public Clip() {
    }

    public Clip(Video video, Artist artist, String youtubeVideoId, String title, int startSec, int endSec) {
        this.video = video;
        this.artist = artist;
        this.youtubeVideoId = youtubeVideoId;
        this.title = title;
        this.startSec = startSec;
        this.endSec = endSec;
    }

    public Long getId() {
        return id;
    }

    public Video getVideo() {
        return video;
    }

    public void setVideo(Video video) {
        this.video = video;
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

    public int getStartSec() {
        return startSec;
    }

    public void setStartSec(int startSec) {
        this.startSec = startSec;
    }

    public int getEndSec() {
        return endSec;
    }

    public void setEndSec(int endSec) {
        this.endSec = endSec;
    }

    public List<String> getTags() {
        return tags;
    }

    public void setTags(List<String> tags) {
        this.tags = tags;
    }
}
