package com.wicketly.domain;

import com.wicketly.engine.Dismissal;
import com.wicketly.engine.ExtraType;
import jakarta.persistence.*;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "tournament_team")
public class TournamentTeam {
    @Id public UUID id = UUID.randomUUID();
    public UUID tournamentId, teamId;
    public String groupName;
}
