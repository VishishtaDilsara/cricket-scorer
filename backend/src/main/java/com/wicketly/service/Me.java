package com.wicketly.service;

import java.util.UUID;
import org.springframework.security.oauth2.jwt.Jwt;

/** The signed-in user, or null for an anonymous viewer. */
public record Me(UUID id, boolean admin) {
    public static Me of(Jwt jwt) {
        return jwt == null ? null : new Me(UUID.fromString(jwt.getSubject()), Boolean.TRUE.equals(jwt.getClaim("adm")));
    }
}
