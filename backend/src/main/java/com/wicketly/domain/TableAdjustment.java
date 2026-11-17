package com.wicketly.domain;

import com.wicketly.engine.Dismissal;
import com.wicketly.engine.ExtraType;
import jakarta.persistence.*;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "table_adjustment")
public class TableAdjustment {
    @Id public UUID id = UUID.randomUUID();
    public UUID tournamentId, teamId;
    public int pointsDelta;
    public String reason;
    public UUID createdBy;
    public Instant createdAt = Instant.now();
}
