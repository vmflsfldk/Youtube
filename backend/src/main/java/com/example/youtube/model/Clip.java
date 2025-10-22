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

    @ManyToOne(optional = false)
    @JoinColumn(name = "video_id")
    private Video video;

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

    @Column(name = "original_composer")
    private String originalComposer;

    @OneToMany(mappedBy = "clip", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<SongTitle> titles = new ArrayList<>();

    @OneToMany(mappedBy = "clip", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<ComposerName> composerNames = new ArrayList<>();

    public Clip() {
    }

    public Clip(Video video, String title, int startSec, int endSec) {
        this.video = video;
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

    public String getOriginalComposer() {
        return originalComposer;
    }

    public void setOriginalComposer(String originalComposer) {
        this.originalComposer = originalComposer;
    }

    public List<SongTitle> getTitles() {
        if (titles == null) {
            titles = new ArrayList<>();
        }
        return titles;
    }

    public void setTitles(List<SongTitle> titles) {
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
        title.setClip(this);
        title.setVideo(null);
        getTitles().add(title);
    }

    public List<ComposerName> getComposerNames() {
        if (composerNames == null) {
            composerNames = new ArrayList<>();
        }
        return composerNames;
    }

    public void setComposerNames(List<ComposerName> composerNames) {
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
        composerName.setClip(this);
        composerName.setVideo(null);
        getComposerNames().add(composerName);
    }
}
