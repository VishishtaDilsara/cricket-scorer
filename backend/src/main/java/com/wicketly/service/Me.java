package com.wicketly.service;

import java.util.UUID;
import org.springframework.security.oauth2.jwt.Jwt;

/**
 * The signed-in user, or null for an anonymous viewer. {@code org} is the admin whose teams, players, tournaments
 * and matches this account works with: an admin's own id, or for a scorer the admin who created it.
 */
public record Me(UUID id, String role, UUID org) {
    public static final String ADMIN = "ADMIN", SCORER = "SCORER";

    public boolean admin() { return ADMIN.equals(role); }

    public static Me of(Jwt jwt) {
        if (jwt == null) return null;
        UUID id = UUID.fromString(jwt.getSubject());
        String role = jwt.getClaimAsString("role");
        String org = jwt.getClaimAsString("org");
        // Tokens issued before roles existed belong to accounts that all became admins of their own space.
        return new Me(id, role == null ? ADMIN : role, org == null ? id : UUID.fromString(org));
    }

    /** The admin space to filter lists by, or null when nobody is signed in. */
    public static UUID orgOf(Me me) { return me == null ? null : me.org(); }
}
