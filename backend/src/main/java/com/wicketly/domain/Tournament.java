package com.wicketly.domain;

import com.wicketly.engine.Dismissal;
import com.wicketly.engine.ExtraType;
import jakarta.persistence.*;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "tournament")
public class Tournament {
    @Id public UUID id = UUID.randomUUID();
    public String name, structure, venue, ballType, status = "DRAFT";
    public boolean doubleRound;
    public LocalDate startDate, endDate;
    public int overs = 20, playersPerSide = 11, ballsPerOver = 6;
    public int pointsWin = 2, pointsLoss = 0, pointsTie = 1, pointsNr = 1, qualifyPerGroup = 2;
    public UUID ownerId;
    public Instant createdAt = Instant.now();
}
