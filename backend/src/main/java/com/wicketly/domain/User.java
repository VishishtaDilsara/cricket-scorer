package com.wicketly.domain;

import com.wicketly.engine.Dismissal;
import com.wicketly.engine.ExtraType;
import jakarta.persistence.*;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "app_user")
public class User {
    @Id public UUID id = UUID.randomUUID();
    public String email, name, passwordHash, username;
    /** ADMIN or SCORER. */
    public String role = "ADMIN";
    /** The admin whose space this account works in: the admin's own id, or for a scorer the admin who created it. */
    public UUID orgId;
    public Instant createdAt = Instant.now();
}
