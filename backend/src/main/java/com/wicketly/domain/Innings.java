package com.wicketly.domain;

import com.wicketly.engine.Dismissal;
import com.wicketly.engine.ExtraType;
import jakarta.persistence.*;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "innings")
public class Innings {
    @Id public UUID id = UUID.randomUUID();
    public UUID matchId;
    public int inningsNo;
    public UUID battingTeamId, bowlingTeamId;
    public Integer target, revisedOvers;
    public boolean targetRevised;
    public UUID strikerId, nonStrikerId, bowlerId;
    public int runs, wickets, legalBalls;
    public boolean closed;
    public String endReason;
}
