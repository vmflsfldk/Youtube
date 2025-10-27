package com.example.youtube.model;

import jakarta.persistence.CascadeType;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import java.util.ArrayList;
import java.util.List;

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

    @Column(name = "name_ko")
    private String nameKo;

    @Column(name = "name_jp")
    private String nameJp;

    @Column(name = "name_en")
    private String nameEn;

    @Column(name = "youtube_channel_id", nullable = false)
    private String youtubeChannelId;

    @Column(name = "youtube_channel_title")
    private String youtubeChannelTitle;

    @Column(name = "profile_image_url")
    private String profileImageUrl;

    @Column(name = "agency", length = 255)
    private String agency;

    @ManyToOne(optional = false)
    @JoinColumn(name = "created_by")
    private UserAccount createdBy;

    @Column(name = "available_ko", nullable = false)
    private boolean availableKo;

    @Column(name = "available_en", nullable = false)
    private boolean availableEn;

    @Column(name = "available_jp", nullable = false)
    private boolean availableJp;

    @ElementCollection
    @CollectionTable(name = "artist_tags", joinColumns = @JoinColumn(name = "artist_id"))
    @Column(name = "tag", nullable = false)
    private List<String> tags = new ArrayList<>();

    @OneToMany(mappedBy = "artist", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<ArtistName> names = new ArrayList<>();

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

    public String getNameKo() {
        return nameKo;
    }

    public void setNameKo(String nameKo) {
        this.nameKo = nameKo;
    }

    public String getNameJp() {
        return nameJp;
    }

    public void setNameJp(String nameJp) {
        this.nameJp = nameJp;
    }

    public String getNameEn() {
        return nameEn;
    }

    public void setNameEn(String nameEn) {
        this.nameEn = nameEn;
    }

    public String getYoutubeChannelId() {
        return youtubeChannelId;
    }

    public void setYoutubeChannelId(String youtubeChannelId) {
        this.youtubeChannelId = youtubeChannelId;
    }

    public String getYoutubeChannelTitle() {
        return youtubeChannelTitle;
    }

    public void setYoutubeChannelTitle(String youtubeChannelTitle) {
        this.youtubeChannelTitle = youtubeChannelTitle;
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

    public String getAgency() {
        return agency;
    }

    public void setAgency(String agency) {
        this.agency = agency;
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

    public List<String> getTags() {
        if (tags == null) {
            tags = new ArrayList<>();
        }
        return tags;
    }

    public void setTags(List<String> tags) {
        this.tags = tags == null ? new ArrayList<>() : new ArrayList<>(tags);
    }

    public List<ArtistName> getNames() {
        if (names == null) {
            names = new ArrayList<>();
        }
        return names;
    }

    public void setNames(List<ArtistName> names) {
        getNames().clear();
        if (names != null) {
            for (ArtistName name : names) {
                addName(name);
            }
        }
    }

    public void addName(ArtistName artistName) {
        if (artistName == null) {
            return;
        }
        artistName.setArtist(this);
        getNames().add(artistName);
    }
}
