package com.wicketly.domain;

import com.wicketly.engine.Dismissal;
import com.wicketly.engine.ExtraType;
import jakarta.persistence.*;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "match_scorer")
public class MatchScorer {
    @Id public UUID id = UUID.randomUUID();
    public UUID matchId, userId;
}
