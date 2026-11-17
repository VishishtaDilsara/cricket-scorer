package com.wicketly.domain;

import com.wicketly.engine.Dismissal;
import com.wicketly.engine.ExtraType;
import jakarta.persistence.*;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "audit_entry")
public class AuditEntry {
    @Id public UUID id = UUID.randomUUID();
    public UUID userId;
    public String entity;
    public UUID entityId;
    public String action, oldValue, newValue;
    public Instant createdAt = Instant.now();
}
