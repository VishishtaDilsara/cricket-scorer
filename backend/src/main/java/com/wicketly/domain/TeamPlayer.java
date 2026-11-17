package com.wicketly.domain;

import com.wicketly.engine.Dismissal;
import com.wicketly.engine.ExtraType;
import jakarta.persistence.*;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "team_player")
public class TeamPlayer {
    @Id public UUID id = UUID.randomUUID();
    public UUID teamId, playerId;
}
