package com.wicketly.domain;

import com.wicketly.engine.Dismissal;
import com.wicketly.engine.ExtraType;
import jakarta.persistence.*;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "cricket_match")
public class Match {
    @Id public UUID id = UUID.randomUUID();
    public UUID tournamentId;
    public String stage, groupName, code, label;
    @Column(name = "source_a") public String sourceA;
    @Column(name = "source_b") public String sourceB;
    public int sortOrder;
    @Column(name = "team_a_id") public UUID teamAId;
    @Column(name = "team_b_id") public UUID teamBId;
    public Instant scheduledAt;
    public String ground, format;
    public int overs = 20, playersPerSide = 11, ballsPerOver = 6, maxOversPerBowler, wideRuns = 1, noBallRuns = 1;
    public boolean freeHit, lastManStands;
    public UUID tossWinnerId;
    public String tossDecision;
    public String state = "SCHEDULED";
    public String resultType;
    public UUID winnerId;
    public String resultText, overrideReason;
    public UUID playerOfMatchId;
    @Column(name = "team_a_captain_id") public UUID teamACaptainId;
    @Column(name = "team_a_vice_captain_id") public UUID teamAViceCaptainId;
    @Column(name = "team_a_keeper_id") public UUID teamAKeeperId;
    @Column(name = "team_b_captain_id") public UUID teamBCaptainId;
    @Column(name = "team_b_vice_captain_id") public UUID teamBViceCaptainId;
    @Column(name = "team_b_keeper_id") public UUID teamBKeeperId;
    public boolean listed = true, practice;
    public UUID createdBy, ownerId;
    public String lockDevice;
    public Instant completedAt;
    public Instant createdAt = Instant.now();
}
