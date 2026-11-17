package com.wicketly.domain;

import com.wicketly.engine.Dismissal;
import com.wicketly.engine.ExtraType;
import jakarta.persistence.*;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "team")
public class Team {
    @Id public UUID id = UUID.randomUUID();
    public String name, shortName, homeGround;
    public UUID ownerId;
    public Instant createdAt = Instant.now();
}
