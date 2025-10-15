package com.example.youtube.config;

import com.example.youtube.model.UserAccount;
import com.example.youtube.service.UserService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
public class UserRequestInterceptor implements HandlerInterceptor {

    public static final String CURRENT_USER_ATTR = "currentUser";

    private final UserService userService;

    public UserRequestInterceptor(UserService userService) {
        this.userService = userService;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        String email = request.getHeader("X-User-Email");
        String displayName = request.getHeader("X-User-Name");
        if (email == null || email.isBlank()) {
            email = "guest@example.com";
        }
        if (displayName != null && displayName.isBlank()) {
            displayName = null;
        }
        UserAccount user = userService.getOrCreateUser(email, displayName);
        request.setAttribute(CURRENT_USER_ATTR, user);
        return true;
    }
}
