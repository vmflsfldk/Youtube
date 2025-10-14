package com.example.youtube.repository;

import com.example.youtube.model.Artist;
import com.example.youtube.model.UserAccount;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ArtistRepository extends JpaRepository<Artist, Long> {
    List<Artist> findByCreatedBy(UserAccount user);
}
