package com.example.youtube.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "video_sections")
public class VideoSection {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "video_id")
    private Video video;

    @Column(nullable = false)
    private String title;

    @Column(name = "start_sec", nullable = false)
    private int startSec;

    @Column(name = "end_sec", nullable = false)
    private int endSec;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private VideoSectionSource source;

    public VideoSection() {
    }

    public VideoSection(Video video, String title, int startSec, int endSec, VideoSectionSource source) {
        this.video = video;
        this.title = title;
        this.startSec = startSec;
        this.endSec = endSec;
        this.source = source;
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

    public VideoSectionSource getSource() {
        return source;
    }

    public void setSource(VideoSectionSource source) {
        this.source = source;
    }
}
