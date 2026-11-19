package com.wicketly.service;

import com.wicketly.domain.*;
import com.wicketly.engine.*;
import com.wicketly.repo.*;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Every scoring write. Each operation is idempotent (balls and players carry client-generated ids),
 * so a phone that was offline can replay its queue safely and nothing is recorded twice.
 */
@Service
@Transactional
public class ScoringService {
    public record StartReq(UUID tossWinnerId, String decision) {}
    public record PlayersReq(UUID strikerId, UUID nonStrikerId, UUID bowlerId) {}
    public record BallReq(UUID id, UUID strikerId, UUID nonStrikerId, UUID bowlerId, int runsBat, ExtraType extraType,
                          int extraRuns, ExtraType subExtra, Dismissal dismissal, UUID dismissedId, UUID fielderId) {}
    public record ReviseReq(Integer overs, Integer target) {}
    public record ResultReq(String resultType, UUID winnerId, String reason) {}

    private final MatchService matchService;
    private final MatchRepo matches;
    private final InningsRepo inningsRepo;
    private final BallRepo balls;
    private final TeamRepo teams;
    private final AuditRepo audit;
    private final Access access;
    private final LiveHub live;
    private final TournamentService tournaments;

    public ScoringService(MatchService matchService, MatchRepo matches, InningsRepo inningsRepo, BallRepo balls,
                          TeamRepo teams, AuditRepo audit, Access access, LiveHub live, TournamentService tournaments) {
        this.matchService = matchService; this.matches = matches; this.inningsRepo = inningsRepo; this.balls = balls;
        this.teams = teams; this.audit = audit; this.access = access; this.live = live; this.tournaments = tournaments;
    }

    /** Only one device scores at a time (FR-SCR-24). Returns true when this device now holds the match. */
    public boolean claim(UUID matchId, Me me, String device, boolean force) {
        Match m = matchService.get(matchId);
        if (!access.canScore(me, m)) throw Api.forbidden();
        if (m.lockDevice == null || force) m.lockDevice = device;
        return m.lockDevice != null && m.lockDevice.equals(device);
    }

    private Match scorable(UUID matchId, Me me, String device) {
        Match m = matchService.get(matchId);
        if (!access.canScore(me, m)) throw Api.forbidden();
        if (device != null) {
            if (m.lockDevice == null) m.lockDevice = device;
            else if (!m.lockDevice.equals(device)) throw Api.conflict("Another device has taken over scoring this match");
        }
        live.publish(m.id);
        return m;
    }

    private Innings innings(Match m, int no) {
        return inningsRepo.findByMatchIdAndInningsNo(m.id, no).orElseThrow(() -> Api.notFound("Innings"));
    }

    public void start(UUID matchId, StartReq r, Me me, String device) {
        Match m = scorable(matchId, me, device);
        if (!m.state.equals("SCHEDULED")) return;
        if (m.teamAId == null || m.teamBId == null) throw Api.conflict("Both teams must be known before the match starts");
        if (m.teamACaptainId == null || m.teamBCaptainId == null || m.teamAKeeperId == null || m.teamBKeeperId == null)
            throw Api.bad("Choose a captain and a wicket-keeper for both teams before the toss");
        if (r.tossWinnerId() == null || !(r.tossWinnerId().equals(m.teamAId) || r.tossWinnerId().equals(m.teamBId)))
            throw Api.bad("Toss winner must be one of the two teams");
        boolean bat = "BAT".equals(r.decision());
        if (!bat && !"BOWL".equals(r.decision())) throw Api.bad("Toss decision must be BAT or BOWL");
        m.tossWinnerId = r.tossWinnerId();
        m.tossDecision = r.decision();
        UUID other = m.teamAId.equals(r.tossWinnerId()) ? m.teamBId : m.teamAId;
        Innings i = new Innings();
        i.matchId = m.id;
        i.inningsNo = 1;
        i.battingTeamId = bat ? r.tossWinnerId() : other;
        i.bowlingTeamId = bat ? other : r.tossWinnerId();
        inningsRepo.save(i);
        m.state = "LIVE";
        tournaments.markLive(m);
    }

    public void startInnings(UUID matchId, int no, Me me, String device) {
        Match m = scorable(matchId, me, device);
        if (inningsRepo.findByMatchIdAndInningsNo(m.id, no).isPresent()) return;
        if (no != 2) throw Api.bad("Only a second innings can be started");
        Innings first = innings(m, 1);
        if (!first.closed) throw Api.conflict("The first innings is still in progress");
        Innings i = new Innings();
        i.matchId = m.id;
        i.inningsNo = 2;
        i.battingTeamId = first.bowlingTeamId;
        i.bowlingTeamId = first.battingTeamId;
        i.target = first.runs + 1;
        i.revisedOvers = first.revisedOvers;
        inningsRepo.save(i);
        m.state = "LIVE";
    }

    public void setPlayers(UUID matchId, int no, PlayersReq r, Me me, String device) {
        Match m = scorable(matchId, me, device);
        Innings i = innings(m, no);
        if (r.strikerId() != null && r.strikerId().equals(r.nonStrikerId())) throw Api.bad("Striker and non-striker must differ");
        i.strikerId = r.strikerId();
        i.nonStrikerId = r.nonStrikerId();
        i.bowlerId = r.bowlerId();
    }

    public void addBall(UUID matchId, int no, BallReq r, Me me, String device) {
        Match m = scorable(matchId, me, device);
        if (r.id() != null && balls.existsById(r.id())) return; // already synced
        Innings i = innings(m, no);
        if (i.closed) throw Api.conflict("This innings has ended");
        List<Ball> list = new ArrayList<>(balls.findByInningsIdOrderBySeq(i.id));
        Ball b = new Ball();
        if (r.id() != null) b.id = r.id();
        b.inningsId = i.id;
        b.seq = list.isEmpty() ? 1 : list.get(list.size() - 1).seq + 1;
        b.strikerId = r.strikerId();
        b.nonStrikerId = r.nonStrikerId();
        b.bowlerId = r.bowlerId();
        copy(b, r);
        ScoringEngine.validate(MatchService.event(b), MatchService.replay(m, i, list).freeHitNext);
        list.add(b);
        balls.save(b);
        InningsState st = MatchService.replay(m, i, list);
        totals(i, st);
        i.strikerId = st.nextStriker;
        i.nonStrikerId = st.nextNonStriker;
        i.bowlerId = st.overComplete ? null : b.bowlerId;
        if (st.complete) close(m, i, "AUTO");
    }

    public void editBall(UUID matchId, int no, UUID ballId, BallReq r, Me me, String device) {
        Match m = scorable(matchId, me, device);
        Innings i = innings(m, no);
        List<Ball> list = balls.findByInningsIdOrderBySeq(i.id);
        int idx = -1;
        for (int k = 0; k < list.size(); k++) if (list.get(k).id.equals(ballId)) idx = k;
        if (idx < 0) throw Api.notFound("Ball");
        Ball b = list.get(idx);
        String before = describe(b);
        copy(b, r);
        ScoringEngine.validate(MatchService.event(b), MatchService.replay(m, i, list.subList(0, idx)).freeHitNext);
        InningsState st = MatchService.replay(m, i, list);
        totals(i, st);
        if (idx == list.size() - 1 && !i.closed) {
            i.strikerId = st.nextStriker;
            i.nonStrikerId = st.nextNonStriker;
        }
        if (m.state.equals("COMPLETED")) log(me, "ball", b.id, "EDIT", before, describe(b));
        if (no == 1) inningsRepo.findByMatchIdAndInningsNo(m.id, 2).filter(x -> !x.targetRevised).ifPresent(x -> x.target = i.runs + 1);
        if (!i.closed && st.complete) close(m, i, "AUTO");
        else if (m.state.equals("COMPLETED") && m.overrideReason == null) finish(m);
    }

    public void undo(UUID matchId, int no, UUID ballId, Me me, String device) {
        Match m = scorable(matchId, me, device);
        Innings i = innings(m, no);
        Optional<Ball> last = balls.findTopByInningsIdOrderBySeqDesc(i.id);
        if (last.isEmpty() || !last.get().id.equals(ballId)) return; // already undone
        Ball b = last.get();
        if (no == 1) {
            Optional<Innings> second = inningsRepo.findByMatchIdAndInningsNo(m.id, 2);
            if (second.isPresent()) {
                if (balls.countByInningsId(second.get().id) > 0) throw Api.conflict("The second innings has started; edit the ball instead");
                inningsRepo.delete(second.get());
            }
        }
        if (m.state.equals("COMPLETED")) log(me, "ball", b.id, "UNDO", describe(b), null);
        balls.delete(b);
        balls.flush();
        totals(i, MatchService.replay(m, i, balls.findByInningsIdOrderBySeq(i.id)));
        i.strikerId = b.strikerId;
        i.nonStrikerId = b.nonStrikerId;
        i.bowlerId = b.bowlerId;
        i.closed = false;
        i.endReason = null;
        m.state = "LIVE";
        m.resultType = null; m.winnerId = null; m.resultText = null; m.overrideReason = null; m.completedAt = null;
    }

    public void endInnings(UUID matchId, int no, Me me, String device) {
        Match m = scorable(matchId, me, device);
        Innings i = innings(m, no);
        if (!i.closed) close(m, i, "MANUAL");
    }

    /** Interrupted match: reduce the overs and, in a chase, enter the revised target by hand (FR-SCR-20). */
    public void revise(UUID matchId, int no, ReviseReq r, Me me, String device) {
        Match m = scorable(matchId, me, device);
        Innings i = innings(m, no);
        if (r.overs() != null) {
            if (r.overs() < 1 || r.overs() > m.overs) throw Api.bad("Revised overs must be between 1 and " + m.overs);
            i.revisedOvers = r.overs();
        }
        if (r.target() != null) {
            if (no != 2) throw Api.bad("A target can only be revised in the second innings");
            if (r.target() < 1) throw Api.bad("Target must be positive");
            i.target = r.target();
            i.targetRevised = true;
        }
        InningsState st = MatchService.replay(m, i, balls.findByInningsIdOrderBySeq(i.id));
        if (!i.closed && st.complete) close(m, i, "AUTO");
    }

    /** Result override, abandonment, walkover or a knockout tie decision. A reason is always recorded. */
    public void setResult(UUID matchId, ResultReq r, Me me) {
        Match m = matchService.get(matchId);
        if (!access.canScore(me, m)) throw Api.forbidden();
        if (r.reason() == null || r.reason().isBlank()) throw Api.bad("A reason is required");
        String old = m.state + " / " + m.resultText;
        switch (r.resultType() == null ? "" : r.resultType()) {
            case "WIN" -> {
                if (r.winnerId() == null || !(r.winnerId().equals(m.teamAId) || r.winnerId().equals(m.teamBId)))
                    throw Api.bad("Winner must be one of the two teams");
                m.winnerId = r.winnerId();
                m.resultText = teamName(r.winnerId()) + " won (" + r.reason().trim() + ")";
                m.state = "COMPLETED";
            }
            case "TIE" -> { m.winnerId = null; m.resultText = "Match tied"; m.state = "COMPLETED"; }
            case "NO_RESULT" -> { m.winnerId = null; m.resultText = "No result"; m.state = "COMPLETED"; }
            case "ABANDONED" -> { m.winnerId = null; m.resultText = "Match abandoned"; m.state = "ABANDONED"; }
            default -> throw Api.bad("Unknown result type");
        }
        m.resultType = r.resultType().equals("ABANDONED") ? "NO_RESULT" : r.resultType();
        m.overrideReason = r.reason().trim();
        m.completedAt = Instant.now();
        inningsRepo.findByMatchIdOrderByInningsNo(m.id).forEach(i -> i.closed = true);
        log(me, "match", m.id, "RESULT", old, m.state + " / " + m.resultText);
        live.publish(m.id);
        tournaments.onResult(m);
    }

    // ---------- internals ----------

    private static void copy(Ball b, BallReq r) {
        b.runsBat = r.runsBat();
        b.extraType = r.extraType() == null ? ExtraType.NONE : r.extraType();
        b.extraRuns = r.extraRuns();
        b.subExtra = b.extraType == ExtraType.NO_BALL ? r.subExtra() : null;
        b.dismissal = r.dismissal();
        b.dismissedId = r.dismissal() == null ? null : r.dismissedId();
        b.fielderId = r.dismissal() == null ? null : r.fielderId();
    }

    private static void totals(Innings i, InningsState st) {
        i.runs = st.runs;
        i.wickets = st.wickets;
        i.legalBalls = st.legalBalls;
    }

    private void close(Match m, Innings i, String reason) {
        i.closed = true;
        i.endReason = reason;
        if (i.inningsNo == 1) m.state = "INNINGS_BREAK";
        else finish(m);
    }

    /** Works out the result from the two innings (FR-SCR-18). */
    private void finish(Match m) {
        Innings first = innings(m, 1), second = innings(m, 2);
        int target = second.target == null ? first.runs + 1 : second.target;
        if (second.runs >= target) {
            int left = MatchService.rules(m, second).maxWickets() - second.wickets;
            m.resultType = "WIN";
            m.winnerId = second.battingTeamId;
            m.resultText = teamName(m.winnerId) + " won by " + left + (left == 1 ? " wicket" : " wickets");
        } else if (second.runs == target - 1) {
            m.resultType = "TIE";
            m.winnerId = null;
            m.resultText = "Match tied";
        } else {
            int margin = target - 1 - second.runs;
            m.resultType = "WIN";
            m.winnerId = first.battingTeamId;
            m.resultText = teamName(m.winnerId) + " won by " + margin + (margin == 1 ? " run" : " runs");
        }
        m.state = "COMPLETED";
        m.completedAt = Instant.now();
        tournaments.onResult(m);
    }

    private String teamName(UUID id) {
        return teams.findById(id).map(t -> t.name).orElse("Team");
    }

    private static String describe(Ball b) {
        return "bat=" + b.runsBat + " extra=" + b.extraType + "+" + b.extraRuns + " dismissal=" + b.dismissal;
    }

    private void log(Me me, String entity, UUID id, String action, String oldValue, String newValue) {
        AuditEntry a = new AuditEntry();
        a.userId = me.id(); a.entity = entity; a.entityId = id; a.action = action; a.oldValue = oldValue; a.newValue = newValue;
        audit.save(a);
    }
}
