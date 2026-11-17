package com.wicketly.domain;

import com.wicketly.engine.Dismissal;
import com.wicketly.engine.ExtraType;
import jakarta.persistence.*;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "ball")
public class Ball {
    @Id public UUID id = UUID.randomUUID();
    public UUID inningsId;
    public int seq;
    public UUID strikerId, nonStrikerId, bowlerId;
    public int runsBat, extraRuns;
    @Enumerated(EnumType.STRING) public ExtraType extraType = ExtraType.NONE;
    @Enumerated(EnumType.STRING) public ExtraType subExtra;
    @Enumerated(EnumType.STRING) public Dismissal dismissal;
    public UUID dismissedId, fielderId;
    public Integer shotZone;
    public Instant createdAt = Instant.now();
}
