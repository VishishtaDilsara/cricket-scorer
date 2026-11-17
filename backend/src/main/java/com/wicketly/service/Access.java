package com.wicketly.service;

import com.wicketly.domain.Match;
import com.wicketly.domain.Team;
import com.wicketly.domain.Tournament;
import com.wicketly.repo.MatchRepo;
import com.wicketly.repo.MatchScorerRepo;
import com.wicketly.repo.TournamentRepo;
import org.springframework.stereotype.Component;

/** Role checks. Roles are per team, match or tournament, never global (FR-ACC-04). */
@Component
public class Access {
    private final TournamentRepo tournaments;
    private final MatchScorerRepo scorers;
    private final MatchRepo matches;

    public Access(TournamentRepo tournaments, MatchScorerRepo scorers, MatchRepo matches) {
        this.tournaments = tournaments;
        this.scorers = scorers;
        this.matches = matches;
    }

    public boolean canManage(Me me, Tournament t) {
        return me != null && (me.admin() || t.ownerId.equals(me.id()));
    }

    public boolean canManage(Me me, Match m) {
        if (me == null) return false;
        if (me.admin() || me.id().equals(m.createdBy)) return true;
        return m.tournamentId != null && tournaments.findById(m.tournamentId).map(t -> t.ownerId.equals(me.id())).orElse(false);
    }

    public boolean canScore(Me me, Match m) {
        return me != null && (canManage(me, m) || scorers.existsByMatchIdAndUserId(m.id, me.id()));
    }

    /** Team owner, or a scorer of one of the team's matches (so players can be added as they come in). */
    public boolean canEdit(Me me, Team t) {
        if (me == null) return false;
        if (me.admin() || me.id().equals(t.ownerId)) return true;
        return matches.findByTeam(t.id).stream().anyMatch(m -> canScore(me, m));
    }
}
