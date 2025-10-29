package com.example.youtube.controller;

import com.example.youtube.dto.LibraryMediaResponse;
import com.example.youtube.service.LibraryService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/library")
public class LibraryController {

    private final LibraryService libraryService;

    public LibraryController(LibraryService libraryService) {
        this.libraryService = libraryService;
    }

    @GetMapping("/media")
    public LibraryMediaResponse getMediaLibrary() {
        return libraryService.getLibraryMedia();
    }
}
