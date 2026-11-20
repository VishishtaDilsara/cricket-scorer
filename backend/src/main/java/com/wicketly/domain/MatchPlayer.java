package com.wicketly.domain;

import jakarta.persistence.*;
import java.util.UUID;

/** One player in a side's playing XI for a match. */
@Entity
@Table(name = "match_player")
public class MatchPlayer {
    @Id public UUID id = UUID.randomUUID();
    public UUID matchId, teamId, playerId;
}
