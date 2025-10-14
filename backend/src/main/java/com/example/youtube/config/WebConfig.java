package com.example.youtube.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final UserRequestInterceptor userRequestInterceptor;

    public WebConfig(UserRequestInterceptor userRequestInterceptor) {
        this.userRequestInterceptor = userRequestInterceptor;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(userRequestInterceptor);
    }
}
