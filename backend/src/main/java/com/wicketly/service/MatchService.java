package com.wicketly.service;

import com.wicketly.domain.*;
import com.wicketly.engine.BallEvent;
import com.wicketly.engine.InningsState;
import com.wicketly.engine.Rules;
import com.wicketly.engine.ScoringEngine;
import com.wicketly.repo.*;
import com.wicketly.service.Views.*;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class MatchService {
    public record MatchReq(UUID teamAId, UUID teamBId, String teamAName, String teamBName, Instant scheduledAt,
                           String ground, String format, Integer overs, Integer playersPerSide, Integer ballsPerOver,
                           Integer maxOversPerBowler, Integer wideRuns, Integer noBallRuns, Boolean freeHit,
                           Boolean lastManStands, Boolean listed, Boolean practice, UUID tournamentId) {}

    private final MatchRepo matches;
    private final InningsRepo inningsRepo;
    private final BallRepo balls;
    private final TeamRepo teams;
    private final PlayerRepo players;
    private final TournamentRepo tournaments;
    private final TournamentTeamRepo tournamentTeams;
    private final Access access;
    private final LiveHub live;

    public MatchService(MatchRepo matches, InningsRepo inningsRepo, BallRepo balls, TeamRepo teams, PlayerRepo players,
                        TournamentRepo tournaments, TournamentTeamRepo tournamentTeams,
                        Access access, LiveHub live) {
        this.matches = matches; this.inningsRepo = inningsRepo; this.balls = balls; this.teams = teams;
        this.players = players; this.tournaments = tournaments; this.tournamentTeams = tournamentTeams;
        this.access = access; this.live = live;
    }

    public static Rules rules(Match m, Innings i) {
        int overs = i != null && i.revisedOvers != null ? i.revisedOvers : m.overs;
        return new Rules(overs, m.ballsPerOver, m.playersPerSide, m.maxOversPerBowler, m.wideRuns, m.noBallRuns, m.freeHit, m.lastManStands);
    }

    public static BallEvent event(Ball b) {
        return new BallEvent(b.id, b.strikerId, b.nonStrikerId, b.bowlerId, b.runsBat, b.extraType, b.extraRuns,
                b.subExtra, b.dismissal, b.dismissedId, b.fielderId);
    }

    public static InningsState replay(Match m, Innings i, List<Ball> list) {
        return ScoringEngine.replay(rules(m, i), i.target, list.stream().map(MatchService::event).toList());
    }

    public Match get(UUID id) {
        return matches.findById(id).orElseThrow(() -> Api.notFound("Match"));
    }

    // ---------- read ----------

    public List<MatchSummary> summaries(List<Match> list) {
        if (list.isEmpty()) return List.of();
        Set<UUID> teamIds = new HashSet<>(), tIds = new HashSet<>();
        for (Match m : list) {
            if (m.teamAId != null) teamIds.add(m.teamAId);
            if (m.teamBId != null) teamIds.add(m.teamBId);
            if (m.tournamentId != null) tIds.add(m.tournamentId);
        }
        Map<UUID, Team> teamMap = teams.findAllById(teamIds).stream().collect(Collectors.toMap(t -> t.id, t -> t));
        Map<UUID, String> tNames = tournaments.findAllById(tIds).stream().collect(Collectors.toMap(t -> t.id, t -> t.name));
        Map<UUID, List<Innings>> inns = inningsRepo.findByMatchIdInOrderByInningsNo(list.stream().map(m -> m.id).toList())
                .stream().collect(Collectors.groupingBy(i -> i.matchId));
        return list.stream().map(m -> summary(m, teamMap, tNames, inns.getOrDefault(m.id, List.of()))).toList();
    }

    private static MatchSummary summary(Match m, Map<UUID, Team> teamMap, Map<UUID, String> tNames, List<Innings> inns) {
        List<Score> scores = inns.stream()
                .map(i -> new Score(i.battingTeamId, i.runs, i.wickets, i.legalBalls / m.ballsPerOver + "." + i.legalBalls % m.ballsPerOver))
                .toList();
        return new MatchSummary(m.id, m.tournamentId, tNames.get(m.tournamentId), m.stage, m.groupName, m.code, m.label,
                m.sourceA, m.sourceB, ref(teamMap.get(m.teamAId)), ref(teamMap.get(m.teamBId)), m.scheduledAt, m.ground,
                m.format, m.overs, m.state, m.resultType, m.winnerId, m.resultText, scores);
    }

    public static TeamRef ref(Team t) {
        return t == null ? null : new TeamRef(t.id, t.name, t.shortName);
    }

    public MatchView view(UUID id, Me me, boolean withBalls) {
        Match m = get(id);
        MatchSummary summary = summaries(List.of(m)).get(0);
        Map<UUID, String> names = new HashMap<>();
        TeamFull a = full(m.teamAId, names), b = full(m.teamBId, names);
        List<InningsView> views = new ArrayList<>();
        for (Innings i : inningsRepo.findByMatchIdOrderByInningsNo(id)) {
            List<Ball> list = balls.findByInningsIdOrderBySeq(i.id);
            InningsState st = replay(m, i, list);
            name(st, names);
            List<BallView> raw = !withBalls ? null : list.stream().map(x -> new BallView(x.id, x.strikerId, x.nonStrikerId,
                    x.bowlerId, x.runsBat, x.extraType, x.extraRuns, x.subExtra, x.dismissal, x.dismissedId, x.fielderId)).toList();
            views.add(new InningsView(i.inningsNo, i.battingTeamId, i.bowlingTeamId, i.target, i.revisedOvers, i.closed,
                    i.strikerId, i.nonStrikerId, i.bowlerId, st, raw));
        }
        return new MatchView(summary, rules(m, null), a, b, m.tossWinnerId, m.tossDecision, m.listed, m.practice,
                m.overrideReason, m.playerOfMatchId, access.canScore(me, m), access.canManage(me, m), views, roles(m));
    }

    private static List<TeamRoles> roles(Match m) {
        List<TeamRoles> out = new ArrayList<>();
        if (m.teamAId != null) out.add(new TeamRoles(m.teamAId, m.teamACaptainId, m.teamAViceCaptainId, m.teamAKeeperId));
        if (m.teamBId != null) out.add(new TeamRoles(m.teamBId, m.teamBCaptainId, m.teamBViceCaptainId, m.teamBKeeperId));
        return out;
    }

    public record RolesReq(UUID teamId, UUID captainId, UUID viceCaptainId, UUID keeperId) {}

    /** Sets one side's captain, vice-captain (optional) and wicket-keeper. Anyone who can score the match may do it. */
    public void setRoles(UUID id, RolesReq r, Me me) {
        Match m = get(id);
        if (!access.canScore(me, m)) throw Api.forbidden();
        boolean a = r.teamId() != null && r.teamId().equals(m.teamAId), b = r.teamId() != null && r.teamId().equals(m.teamBId);
        if (!a && !b) throw Api.bad("That team is not playing in this match");
        Set<UUID> squad = new HashSet<>();
        players.findByTeam(r.teamId()).forEach(p -> squad.add(p.id));
        for (UUID p : java.util.Arrays.asList(r.captainId(), r.viceCaptainId(), r.keeperId()))
            if (p != null && !squad.contains(p)) throw Api.bad("Captain, vice-captain and wicket-keeper must be in the team");
        if (r.captainId() != null && r.captainId().equals(r.viceCaptainId())) throw Api.bad("The captain cannot also be the vice-captain");
        if (a) { m.teamACaptainId = r.captainId(); m.teamAViceCaptainId = r.viceCaptainId(); m.teamAKeeperId = r.keeperId(); }
        else { m.teamBCaptainId = r.captainId(); m.teamBViceCaptainId = r.viceCaptainId(); m.teamBKeeperId = r.keeperId(); }
        live.publish(m.id);
    }

    /** Sets (or clears, with null) the player of the match. The player must be in one of the two squads. */
    public void setPlayerOfMatch(UUID id, UUID playerId, Me me) {
        Match m = get(id);
        if (!access.canManage(me, m)) throw Api.forbidden();
        if (playerId != null) {
            boolean inSquad = java.util.stream.Stream.of(m.teamAId, m.teamBId).filter(Objects::nonNull)
                    .flatMap(t -> players.findByTeam(t).stream()).anyMatch(p -> p.id.equals(playerId));
            if (!inSquad) throw Api.bad("That player is not in either squad");
        }
        m.playerOfMatchId = playerId;
        live.publish(m.id);
    }

    private TeamFull full(UUID teamId, Map<UUID, String> names) {
        if (teamId == null) return null;
        Team t = teams.findById(teamId).orElseThrow(() -> Api.notFound("Team"));
        List<PlayerRef> ps = players.findByTeam(teamId).stream().map(p -> new PlayerRef(p.id, p.name)).toList();
        ps.forEach(p -> names.put(p.id(), p.name()));
        return new TeamFull(t.id, t.name, t.shortName, ps);
    }

    /** Fills player names into an innings state. Players removed from a squad are looked up individually. */
    public void name(InningsState st, Map<UUID, String> names) {
        Set<UUID> missing = new HashSet<>();
        st.batters.forEach(x -> { missing.add(x.playerId); if (x.fielderId != null) missing.add(x.fielderId); });
        st.bowlers.forEach(x -> missing.add(x.playerId));
        missing.removeAll(names.keySet());
        if (!missing.isEmpty()) players.findAllById(missing).forEach(p -> names.put(p.id, p.name));
        for (InningsState.Batter x : st.batters) { x.name = names.getOrDefault(x.playerId, "Unknown"); x.howOut = howOut(x, names); }
        for (InningsState.Bowler x : st.bowlers) x.name = names.getOrDefault(x.playerId, "Unknown");
        for (InningsState.Fow x : st.fow) x.name = names.getOrDefault(x.playerId, "Unknown");
        for (InningsState.Over x : st.overs) x.bowlerName = names.getOrDefault(x.bowlerId, "Unknown");
        for (InningsState.Partnership x : st.partnerships) {
            x.nameA = names.getOrDefault(x.batterA, "");
            x.nameB = x.batterB == null ? "" : names.getOrDefault(x.batterB, "");
        }
    }

    private static String howOut(InningsState.Batter b, Map<UUID, String> n) {
        if (b.dismissal == null) return "not out";
        String bw = b.bowlerId == null ? "" : n.getOrDefault(b.bowlerId, "");
        String f = b.fielderId == null ? "" : n.getOrDefault(b.fielderId, "");
        return switch (b.dismissal) {
            case BOWLED -> "b " + bw;
            case CAUGHT -> "c " + (f.isEmpty() ? "sub" : f) + " b " + bw;
            case CAUGHT_AND_BOWLED -> "c & b " + bw;
            case LBW -> "lbw b " + bw;
            case RUN_OUT -> "run out" + (f.isEmpty() ? "" : " (" + f + ")");
            case STUMPED -> "st " + f + " b " + bw;
            case HIT_WICKET -> "hit wicket b " + bw;
            case RETIRED_OUT -> "retired out";
            case RETIRED_HURT -> "retired hurt";
            case OBSTRUCTING_FIELD -> "obstructing the field";
            case TIMED_OUT -> "timed out";
            case HIT_BALL_TWICE -> "hit the ball twice";
        };
    }

    // ---------- write ----------

    public Match create(MatchReq r, Me me) {
        access.requireAdmin(me);
        Match m = new Match();
        m.createdBy = me.id();
        m.ownerId = me.org();
        if (r.tournamentId() != null) {
            Tournament t = tournaments.findById(r.tournamentId()).orElseThrow(() -> Api.notFound("Tournament"));
            if (!access.canManage(me, t)) throw Api.forbidden();
            m.tournamentId = t.id;
            m.stage = "GROUP";
            m.overs = t.overs; m.playersPerSide = t.playersPerSide; m.ballsPerOver = t.ballsPerOver;
            m.sortOrder = matches.findByTournamentIdOrderBySortOrder(t.id).size();
        }
        m.teamAId = team(r.teamAId(), r.teamAName(), me);
        m.teamBId = team(r.teamBId(), r.teamBName(), me);
        if (m.teamAId == null || m.teamBId == null) throw Api.bad("Two teams are required");
        if (m.teamAId.equals(m.teamBId)) throw Api.bad("A team cannot play itself");
        if (m.tournamentId != null)
            m.groupName = tournamentTeams.findByTournamentIdAndTeamId(m.tournamentId, m.teamAId).map(tt -> tt.groupName).orElse(null);
        m.scheduledAt = Instant.now();
        apply(m, r);
        return matches.save(m);
    }

    public Match update(UUID id, MatchReq r, Me me) {
        Match m = get(id);
        if (!access.canManage(me, m)) throw Api.forbidden();
        boolean scheduled = m.state.equals("SCHEDULED");
        if (r.teamAId() != null || r.teamBId() != null) {
            if (!scheduled) throw Api.conflict("Teams cannot change once a match has started");
            if (r.teamAId() != null) m.teamAId = team(r.teamAId(), null, me);
            if (r.teamBId() != null) m.teamBId = team(r.teamBId(), null, me);
            if (m.teamAId != null && m.teamAId.equals(m.teamBId)) throw Api.bad("A team cannot play itself");
        }
        if (!scheduled && (r.overs() != null || r.playersPerSide() != null || r.ballsPerOver() != null))
            throw Api.conflict("Use 'Revise overs' on the scorer screen once a match has started");
        apply(m, r);
        live.publish(m.id);
        return m;
    }

    private void apply(Match m, MatchReq r) {
        if (r.scheduledAt() != null) m.scheduledAt = r.scheduledAt();
        if (r.ground() != null) m.ground = r.ground();
        if (r.format() != null) m.format = r.format();
        if (r.overs() != null) m.overs = range(r.overs(), 1, 100, "Overs");
        if (r.playersPerSide() != null) m.playersPerSide = range(r.playersPerSide(), 2, 11, "Players per side");
        if (r.ballsPerOver() != null) m.ballsPerOver = range(r.ballsPerOver(), 4, 10, "Balls per over");
        if (r.maxOversPerBowler() != null) m.maxOversPerBowler = range(r.maxOversPerBowler(), 0, 100, "Overs per bowler");
        if (r.wideRuns() != null) m.wideRuns = range(r.wideRuns(), 0, 5, "Runs for a wide");
        if (r.noBallRuns() != null) m.noBallRuns = range(r.noBallRuns(), 0, 5, "Runs for a no-ball");
        if (r.freeHit() != null) m.freeHit = r.freeHit();
        if (r.lastManStands() != null) m.lastManStands = r.lastManStands();
        if (r.listed() != null) m.listed = r.listed();
        if (r.practice() != null) m.practice = r.practice();
        if (m.format == null) m.format = m.overs + " overs";
    }

    private static int range(int v, int min, int max, String what) {
        if (v < min || v > max) throw Api.bad(what + " must be between " + min + " and " + max);
        return v;
    }

    /** An existing team from the admin's own space, or a new one created there by name. */
    private UUID team(UUID id, String name, Me me) {
        if (id != null) {
            Team t = teams.findById(id).orElseThrow(() -> Api.notFound("Team"));
            if (!Access.sameOrg(me, t.ownerId)) throw Api.notFound("Team");
            return t.id;
        }
        if (name == null || name.isBlank()) return null;
        return teams.save(newTeam(name, me.org())).id;
    }

    public static Team newTeam(String name, UUID owner) {
        Team t = new Team();
        t.name = name.trim();
        String letters = t.name.replaceAll("[^A-Za-z0-9 ]", "").trim();
        String[] words = letters.split("\\s+");
        String sn = words.length >= 2
                ? Arrays.stream(words).map(w -> w.substring(0, 1)).collect(Collectors.joining())
                : letters.replace(" ", "");
        t.shortName = sn.substring(0, Math.min(sn.length(), words.length >= 2 ? 4 : 3)).toUpperCase();
        t.ownerId = owner;
        return t;
    }

    public void delete(UUID id, Me me) {
        Match m = get(id);
        if (!access.canManage(me, m)) throw Api.forbidden();
        matches.delete(m);
    }
}
