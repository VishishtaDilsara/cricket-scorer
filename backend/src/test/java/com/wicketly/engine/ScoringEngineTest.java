package com.wicketly.engine;

import static org.junit.jupiter.api.Assertions.*;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ScoringEngineTest {
    static final UUID A = UUID.randomUUID(), B = UUID.randomUUID(), C = UUID.randomUUID();
    static final UUID BW = UUID.randomUUID(), BW2 = UUID.randomUUID(), F = UUID.randomUUID();
    static final Rules T20 = new Rules(20, 6, 11, 4, 1, 1, true, false);

    static BallEvent run(UUID s, UUID n, int r) { return ball(s, n, r, ExtraType.NONE, 0, null, null, null); }
    static BallEvent ball(UUID s, UUID n, int bat, ExtraType x, int xr, ExtraType sub, Dismissal d, UUID out) {
        return new BallEvent(UUID.randomUUID(), s, n, BW, bat, x, xr, sub, d, out, d == null ? null : F);
    }
    static InningsState play(Rules r, Integer target, BallEvent... balls) { return ScoringEngine.replay(r, target, List.of(balls)); }

    @Test void runsOffTheBatAndStrikeRotation() {
        InningsState st = play(T20, null, run(A, B, 1), run(B, A, 4), run(B, A, 3));
        assertEquals(8, st.runs);
        assertEquals(3, st.legalBalls);
        assertEquals(A, st.nextStriker);
        assertEquals(1, st.batters.get(0).runs);
        assertEquals(7, st.batters.get(1).runs);
        assertEquals(1, st.batters.get(1).fours);
        assertEquals(8, st.bowlers.get(0).runs);
    }

    @Test void strikeChangesAtEndOfOverAndMaidenIsCounted() {
        BallEvent[] over = new BallEvent[6];
        for (int i = 0; i < 6; i++) over[i] = run(A, B, 0);
        InningsState st = play(T20, null, over);
        assertTrue(st.overComplete);
        assertEquals(B, st.nextStriker);
        assertEquals(1, st.bowlers.get(0).maidens);
        assertEquals(BW, st.lastOverBowler);
        assertEquals("1.0", st.oversText);
    }

    @Test void wideIsNotALegalBallAndIsChargedToBowler() {
        InningsState st = play(T20, null, ball(A, B, 0, ExtraType.WIDE, 2, null, null, null));
        assertEquals(3, st.runs);
        assertEquals(3, st.wides);
        assertEquals(0, st.legalBalls);
        assertEquals(0, st.batters.get(0).balls);
        assertEquals(3, st.bowlers.get(0).runs);
        assertEquals(A, st.nextStriker); // two runs run: no change
    }

    @Test void noBallWithRunsOffBat() {
        InningsState st = play(T20, null, ball(A, B, 4, ExtraType.NO_BALL, 0, null, null, null));
        assertEquals(5, st.runs);
        assertEquals(1, st.noBalls);
        assertEquals(0, st.legalBalls);
        assertEquals(4, st.batters.get(0).runs);
        assertEquals(1, st.batters.get(0).balls);
        assertEquals(5, st.bowlers.get(0).runs);
        assertTrue(st.freeHitNext);
    }

    @Test void noBallWithLegByesChargesOnlyThePenalty() {
        InningsState st = play(T20, null, ball(A, B, 0, ExtraType.NO_BALL, 2, ExtraType.LEG_BYE, null, null));
        assertEquals(3, st.runs);
        assertEquals(2, st.legByes);
        assertEquals(1, st.bowlers.get(0).runs);
        assertEquals(0, st.batters.get(0).runs);
    }

    @Test void byesAndLegByesAreNotChargedToBowler() {
        InningsState st = play(T20, null, ball(A, B, 0, ExtraType.BYE, 1, null, null, null), ball(B, A, 0, ExtraType.LEG_BYE, 2, null, null, null));
        assertEquals(3, st.runs);
        assertEquals(1, st.byes);
        assertEquals(2, st.legByes);
        assertEquals(0, st.bowlers.get(0).runs);
        assertEquals(2, st.legalBalls);
        assertEquals(B, st.nextStriker);
    }

    @Test void penaltyRunsAreNotADelivery() {
        InningsState st = play(T20, null, ball(A, B, 0, ExtraType.PENALTY, 5, null, null, null));
        assertEquals(5, st.runs);
        assertEquals(5, st.penalties);
        assertEquals(0, st.legalBalls);
        assertEquals(0, st.batters.get(0).balls);
    }

    @Test void freeHitCarriesOverAWideAndEndsAfterALegalBall() {
        BallEvent nb = ball(A, B, 0, ExtraType.NO_BALL, 0, null, null, null);
        BallEvent wd = ball(A, B, 0, ExtraType.WIDE, 0, null, null, null);
        assertTrue(play(T20, null, nb, wd).freeHitNext);
        assertFalse(play(T20, null, nb, wd, run(A, B, 0)).freeHitNext);
        assertFalse(play(new Rules(20, 6, 11, 4, 1, 1, false, false), null, nb).freeHitNext);
    }

    @Test void bowlerCreditedOnlyForBowlerDismissals() {
        for (Dismissal d : Dismissal.values()) {
            InningsState st = play(T20, null, ball(A, B, 0, ExtraType.NONE, 0, null, d, A));
            boolean credit = d == Dismissal.BOWLED || d == Dismissal.CAUGHT || d == Dismissal.CAUGHT_AND_BOWLED
                    || d == Dismissal.LBW || d == Dismissal.STUMPED || d == Dismissal.HIT_WICKET;
            assertEquals(credit ? 1 : 0, st.bowlers.get(0).wickets, d.name());
            assertEquals(d == Dismissal.RETIRED_HURT ? 0 : 1, st.wickets, d.name());
            assertEquals(d.offDelivery() ? 1 : 0, st.legalBalls, d.name());
            assertNull(st.nextStriker, d.name());
        }
    }

    @Test void runOutOfNonStrikerAfterOneRun() {
        InningsState st = play(T20, null, ball(A, B, 1, ExtraType.NONE, 0, null, Dismissal.RUN_OUT, B));
        assertEquals(1, st.runs);
        assertEquals(1, st.wickets);
        assertEquals(1, st.fow.get(0).score);
        assertEquals("0.1", st.fow.get(0).over);
        assertNull(st.nextStriker);      // B had crossed to the striker's end
        assertEquals(A, st.nextNonStriker);
        assertEquals(2, st.partnerships.size() == 1 ? 2 : 0, "one stand so far");
    }

    @Test void validationBlocksImpossibleDismissals() {
        assertThrows(IllegalArgumentException.class, () -> ScoringEngine.validate(ball(A, B, 0, ExtraType.NO_BALL, 0, null, Dismissal.BOWLED, A), false));
        assertThrows(IllegalArgumentException.class, () -> ScoringEngine.validate(ball(A, B, 0, ExtraType.NO_BALL, 0, null, Dismissal.LBW, A), false));
        assertThrows(IllegalArgumentException.class, () -> ScoringEngine.validate(ball(A, B, 0, ExtraType.WIDE, 0, null, Dismissal.CAUGHT, A), false));
        assertThrows(IllegalArgumentException.class, () -> ScoringEngine.validate(ball(A, B, 0, ExtraType.NONE, 0, null, Dismissal.CAUGHT, A), true));
        assertThrows(IllegalArgumentException.class, () -> ScoringEngine.validate(ball(A, B, 0, ExtraType.NONE, 0, null, Dismissal.RUN_OUT, C), false));
        assertDoesNotThrow(() -> ScoringEngine.validate(ball(A, B, 0, ExtraType.WIDE, 0, null, Dismissal.STUMPED, A), false));
        assertDoesNotThrow(() -> ScoringEngine.validate(ball(A, B, 1, ExtraType.NO_BALL, 0, null, Dismissal.RUN_OUT, B), false));
        assertDoesNotThrow(() -> ScoringEngine.validate(ball(A, B, 0, ExtraType.NONE, 0, null, Dismissal.RUN_OUT, A), true));
    }

    @Test void inningsEndsOnOversWicketsOrTarget() {
        Rules oneOver = new Rules(1, 6, 3, 0, 1, 1, false, false);
        List<BallEvent> six = new ArrayList<>();
        for (int i = 0; i < 6; i++) six.add(run(A, B, 0));
        assertTrue(ScoringEngine.replay(oneOver, null, six).complete);
        assertFalse(ScoringEngine.replay(oneOver, null, six.subList(0, 5)).complete);

        InningsState out = play(oneOver, null, ball(A, B, 0, ExtraType.NONE, 0, null, Dismissal.BOWLED, A),
                ball(C, B, 0, ExtraType.NONE, 0, null, Dismissal.BOWLED, C));
        assertTrue(out.allOut);
        assertTrue(out.complete);

        assertTrue(play(T20, 5, run(A, B, 6)).complete);
        assertFalse(play(T20, 7, run(A, B, 6)).complete);
    }

    @Test void lastManStandsBatsAlone() {
        Rules lms = new Rules(5, 6, 3, 0, 1, 1, false, true);
        InningsState st = play(lms, null, ball(A, B, 0, ExtraType.NONE, 0, null, Dismissal.BOWLED, A),
                ball(C, B, 0, ExtraType.NONE, 0, null, Dismissal.BOWLED, C));
        assertFalse(st.complete);
        assertEquals(B, st.nextStriker);
        assertNull(st.nextNonStriker);
        InningsState st2 = play(lms, null, ball(A, B, 0, ExtraType.NONE, 0, null, Dismissal.BOWLED, A),
                ball(C, B, 0, ExtraType.NONE, 0, null, Dismissal.BOWLED, C), run(B, null, 1));
        assertEquals(B, st2.nextStriker);
    }

    @Test void midOverBowlerChangeKeepsBothFiguresAndNoMaiden() {
        List<BallEvent> balls = new ArrayList<>();
        for (int i = 0; i < 3; i++) balls.add(run(A, B, 0));
        for (int i = 0; i < 3; i++) balls.add(new BallEvent(UUID.randomUUID(), A, B, BW2, 0, ExtraType.NONE, 0, null, null, null, null));
        InningsState st = ScoringEngine.replay(T20, null, balls);
        assertEquals(3, st.bowlers.get(0).balls);
        assertEquals(3, st.bowlers.get(1).balls);
        assertEquals(0, st.bowlers.get(0).maidens + st.bowlers.get(1).maidens);
    }

    @Test void retiredHurtBatterCanReturn() {
        InningsState st = play(T20, null, ball(A, B, 0, ExtraType.NONE, 0, null, Dismissal.RETIRED_HURT, A), run(C, B, 1), run(B, C, 0),
                ball(B, C, 0, ExtraType.NONE, 0, null, Dismissal.BOWLED, B), run(A, C, 2));
        assertEquals(1, st.wickets);
        assertNull(st.batters.get(0).dismissal);
        assertEquals(2, st.batters.get(0).runs);
    }
}
