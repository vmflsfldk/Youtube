package com.example.youtube.service;

import com.example.youtube.model.UserAccount;
import com.example.youtube.repository.UserAccountRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserService {

    private final UserAccountRepository userAccountRepository;

    public UserService(UserAccountRepository userAccountRepository) {
        this.userAccountRepository = userAccountRepository;
    }

    @Transactional
    public UserAccount getOrCreateUser(String email, String displayName) {
        return userAccountRepository.findByEmail(email)
                .map(user -> updateDisplayNameIfNecessary(user, displayName))
                .orElseGet(() -> userAccountRepository.save(new UserAccount(email, displayName)));
    }

    private UserAccount updateDisplayNameIfNecessary(UserAccount user, String displayName) {
        if (displayName != null && !displayName.isBlank() && !displayName.equals(user.getDisplayName())) {
            user.setDisplayName(displayName);
        }
        return user;
    }
}
