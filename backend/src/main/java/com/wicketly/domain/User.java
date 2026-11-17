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
    public String email, name, passwordHash;
    @Column(name = "is_admin") public boolean admin;
    public Instant createdAt = Instant.now();
}
