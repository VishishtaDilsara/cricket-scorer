package com.wicketly.engine;

import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * The scoring rules. Pure: an innings' state is always rebuilt by replaying its balls,
 * so undo and edits can never leave totals out of step with the ball records.
 */
public final class ScoringEngine {
    private ScoringEngine() {}

    public static Set<Dismissal> allowedDismissals(ExtraType extra, boolean freeHit) {
        Set<Dismissal> between = EnumSet.of(Dismissal.RETIRED_OUT, Dismissal.RETIRED_HURT, Dismissal.TIMED_OUT);
        Set<Dismissal> s = switch (extra) {
            case WIDE -> EnumSet.of(Dismissal.RUN_OUT, Dismissal.STUMPED, Dismissal.HIT_WICKET, Dismissal.OBSTRUCTING_FIELD);
            case NO_BALL -> EnumSet.of(Dismissal.RUN_OUT, Dismissal.OBSTRUCTING_FIELD, Dismissal.HIT_BALL_TWICE);
            case BYE, LEG_BYE -> EnumSet.of(Dismissal.RUN_OUT, Dismissal.OBSTRUCTING_FIELD);
            case PENALTY -> EnumSet.noneOf(Dismissal.class);
            case NONE -> freeHit
                    ? EnumSet.of(Dismissal.RUN_OUT, Dismissal.OBSTRUCTING_FIELD, Dismissal.HIT_BALL_TWICE)
                    : EnumSet.of(Dismissal.BOWLED, Dismissal.CAUGHT, Dismissal.CAUGHT_AND_BOWLED, Dismissal.LBW,
                        Dismissal.RUN_OUT, Dismissal.STUMPED, Dismissal.HIT_WICKET, Dismissal.OBSTRUCTING_FIELD,
                        Dismissal.HIT_BALL_TWICE);
        };
        if (extra == ExtraType.NONE) s.addAll(between);
        return s;
    }

    /** Rejects records that cannot happen in cricket. */
    public static void validate(BallEvent b, boolean freeHit) {
        if (b.striker() == null || b.bowler() == null) throw new IllegalArgumentException("Striker and bowler are required");
        if (b.runsBat() < 0 || b.extraRuns() < 0) throw new IllegalArgumentException("Runs cannot be negative");
        if (b.striker().equals(b.nonStriker())) throw new IllegalArgumentException("Striker and non-striker must differ");
        if (b.runsBat() > 0 && b.extra() != ExtraType.NONE && b.extra() != ExtraType.NO_BALL)
            throw new IllegalArgumentException("Runs off the bat are not possible on a " + b.extra());
        if (b.dismissal() != null) {
            if (!allowedDismissals(b.extra(), freeHit).contains(b.dismissal()))
                throw new IllegalArgumentException(b.dismissal() + " is not possible on this delivery");
            if (!b.dismissal().offDelivery() && (b.runsBat() > 0 || b.extraRuns() > 0))
                throw new IllegalArgumentException("No runs can be scored on a " + b.dismissal());
            UUID out = b.dismissed() == null ? b.striker() : b.dismissed();
            if (!out.equals(b.striker()) && !out.equals(b.nonStriker()))
                throw new IllegalArgumentException("Dismissed player is not at the crease");
        }
    }

    public static InningsState replay(Rules rules, Integer target, List<BallEvent> balls) {
        InningsState st = new InningsState();
        InningsState.Partnership stand = null;
        boolean freeHit = false;
        int bpo = rules.ballsPerOver();

        for (BallEvent b : balls) {
            boolean delivery = b.isDelivery(), legal = b.isLegal();
            ExtraType x = b.extra();
            int penalty = x == ExtraType.WIDE ? rules.wideRuns() : x == ExtraType.NO_BALL ? rules.noBallRuns() : 0;
            int total = b.runsBat() + b.extraRuns() + penalty;
            st.runs += total;

            switch (x) {
                case WIDE -> st.wides += penalty + b.extraRuns();
                case NO_BALL -> {
                    st.noBalls += penalty;
                    if (b.subExtra() == ExtraType.LEG_BYE) st.legByes += b.extraRuns(); else st.byes += b.extraRuns();
                }
                case BYE -> st.byes += b.extraRuns();
                case LEG_BYE -> st.legByes += b.extraRuns();
                case PENALTY -> st.penalties += b.extraRuns();
                case NONE -> { }
            }

            InningsState.Batter striker = batter(st, b.striker());
            if (b.nonStriker() != null) batter(st, b.nonStriker());
            boolean faced = delivery && x != ExtraType.WIDE;
            if (faced) {
                striker.balls++;
                striker.runs += b.runsBat();
                if (b.runsBat() == 4) striker.fours++;
                if (b.runsBat() == 6) striker.sixes++;
            }

            InningsState.Bowler bowler = bowler(st, b.bowler());
            int conceded = 0;
            if (delivery) {
                conceded = b.runsBat() + (x == ExtraType.WIDE ? penalty + b.extraRuns() : x == ExtraType.NO_BALL ? penalty : 0);
                bowler.runs += conceded;
                if (legal) bowler.balls++;
                if (x == ExtraType.WIDE) bowler.wides += penalty + b.extraRuns();
                if (x == ExtraType.NO_BALL) bowler.noBalls++;
            }

            if (stand == null) {
                stand = new InningsState.Partnership();
                stand.batterA = b.striker();
                stand.batterB = b.nonStriker();
                st.partnerships.add(stand);
            }
            stand.runs += total;
            if (faced) stand.balls++;

            int overIndex = st.legalBalls / bpo;
            InningsState.Over over = st.overs.isEmpty() || st.overs.get(st.overs.size() - 1).number != overIndex + 1
                    ? newOver(st, overIndex + 1, b.bowler()) : st.overs.get(st.overs.size() - 1);
            over.runs += total;
            over.conceded += conceded;
            if (delivery) over.bowledBy.add(b.bowler());

            UUID s = b.striker(), n = b.nonStriker();
            int ran = switch (x) {
                case NONE -> b.runsBat();
                case NO_BALL -> b.runsBat() + b.extraRuns();
                case WIDE, BYE, LEG_BYE -> b.extraRuns();
                case PENALTY -> 0;
            };
            if (ran % 2 == 1) { UUID t = s; s = n; n = t; }

            boolean wicket = false;
            if (b.dismissal() != null) {
                UUID outId = b.dismissed() == null ? b.striker() : b.dismissed();
                InningsState.Batter out = batter(st, outId);
                out.dismissal = b.dismissal();
                out.fielderId = b.fielder();
                out.bowlerId = b.dismissal().bowlerCredit() ? b.bowler() : null;
                if (b.dismissal().isWicket()) {
                    wicket = true;
                    st.wickets++;
                    over.wickets++;
                    if (b.dismissal().bowlerCredit()) bowler.wickets++;
                    InningsState.Fow f = new InningsState.Fow();
                    f.wicket = st.wickets; f.score = st.runs; f.playerId = outId;
                    int lb = st.legalBalls + (legal ? 1 : 0);
                    f.over = lb / bpo + "." + lb % bpo;
                    st.fow.add(f);
                }
                stand = null;
                if (outId.equals(s)) s = null; else if (outId.equals(n)) n = null;
            }
            over.balls.add(label(b, wicket));

            if (legal) {
                st.legalBalls++;
                st.overComplete = st.legalBalls % bpo == 0;
                if (st.overComplete) {
                    UUID t = s; s = n; n = t;
                    if (over.conceded == 0 && over.bowledBy.size() == 1) bowler.maidens++;
                    st.lastOverBowler = b.bowler();
                }
            } else if (delivery) {
                st.overComplete = false;
            }

            // Last man stands: the one remaining batter always faces.
            if (s == null && n != null && rules.lastManStands() && st.wickets >= rules.playersPerSide() - 1) { s = n; n = null; }
            st.nextStriker = s;
            st.nextNonStriker = n;
            if (delivery) freeHit = rules.freeHit() && (x == ExtraType.NO_BALL || (freeHit && x == ExtraType.WIDE));
        }

        // A batter who retired hurt and came back is batting again.
        for (InningsState.Batter bt : st.batters)
            if (bt.dismissal == Dismissal.RETIRED_HURT && (bt.playerId.equals(st.nextStriker) || bt.playerId.equals(st.nextNonStriker)))
                bt.dismissal = null;

        st.freeHitNext = freeHit;
        st.oversText = st.legalBalls / bpo + "." + st.legalBalls % bpo;
        st.allOut = st.wickets >= rules.maxWickets();
        st.complete = st.allOut || st.legalBalls >= rules.maxBalls() || (target != null && st.runs >= target);
        return st;
    }

    private static String label(BallEvent b, boolean wicket) {
        String l = switch (b.extra()) {
            case WIDE -> (b.extraRuns() > 0 ? b.extraRuns() : "") + "wd";
            case NO_BALL -> (b.runsBat() + b.extraRuns() > 0 ? String.valueOf(b.runsBat() + b.extraRuns()) : "") + "nb";
            case BYE -> b.extraRuns() + "b";
            case LEG_BYE -> b.extraRuns() + "lb";
            case PENALTY -> "+" + b.extraRuns();
            case NONE -> b.dismissal() != null && !b.dismissal().offDelivery() ? "ret" : String.valueOf(b.runsBat());
        };
        if (!wicket) return l;
        return l.equals("0") || l.equals("ret") ? "W" : l + "W";
    }

    private static InningsState.Over newOver(InningsState st, int number, UUID bowler) {
        InningsState.Over o = new InningsState.Over();
        o.number = number;
        o.bowlerId = bowler;
        st.overs.add(o);
        return o;
    }

    private static InningsState.Batter batter(InningsState st, UUID id) {
        for (InningsState.Batter b : st.batters) if (b.playerId.equals(id)) return b;
        InningsState.Batter b = new InningsState.Batter();
        b.playerId = id;
        st.batters.add(b);
        return b;
    }

    private static InningsState.Bowler bowler(InningsState st, UUID id) {
        for (InningsState.Bowler b : st.bowlers) if (b.playerId.equals(id)) return b;
        InningsState.Bowler b = new InningsState.Bowler();
        b.playerId = id;
        st.bowlers.add(b);
        return b;
    }
}
