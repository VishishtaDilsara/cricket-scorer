package com.wicketly.service;

import com.wicketly.engine.Dismissal;
import com.wicketly.engine.ExtraType;
import com.wicketly.engine.InningsState;
import com.wicketly.engine.Rules;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** JSON shapes returned by the API. */
public final class Views {
    private Views() {}

    public record TeamRef(UUID id, String name, String shortName) {}
    public record PlayerRef(UUID id, String name) {}
    public record TeamFull(UUID id, String name, String shortName, List<PlayerRef> players) {}
    public record Score(UUID teamId, int runs, int wickets, String overs) {}

    public record MatchSummary(UUID id, UUID tournamentId, String tournamentName, String stage, String groupName,
                               String code, String label, String sourceA, String sourceB, TeamRef teamA, TeamRef teamB,
                               Instant scheduledAt, String ground, String format, int overs, String state,
                               String resultType, UUID winnerId, String resultText, List<Score> scores) {}

    public record BallView(UUID id, UUID strikerId, UUID nonStrikerId, UUID bowlerId, int runsBat, ExtraType extraType,
                           int extraRuns, ExtraType subExtra, Dismissal dismissal, UUID dismissedId, UUID fielderId) {}

    public record InningsView(int no, UUID battingTeamId, UUID bowlingTeamId, Integer target, Integer revisedOvers,
                              boolean closed, UUID strikerId, UUID nonStrikerId, UUID bowlerId,
                              InningsState state, List<BallView> balls) {}

    public record MatchView(MatchSummary summary, Rules rules, TeamFull teamA, TeamFull teamB, UUID tossWinnerId,
                            String tossDecision, boolean listed, boolean practice, String overrideReason, UUID playerOfMatchId,
                            boolean canScore, boolean canManage, List<InningsView> innings, List<TeamRoles> roles) {}

    /** Captain, vice-captain and wicket-keeper of one side for this match. Any of them may still be null. */
    public record TeamRoles(UUID teamId, UUID captainId, UUID viceCaptainId, UUID keeperId) {}
}
