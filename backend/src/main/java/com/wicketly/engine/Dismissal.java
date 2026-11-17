package com.wicketly.engine;

public enum Dismissal {
    BOWLED, CAUGHT, CAUGHT_AND_BOWLED, LBW, RUN_OUT, STUMPED, HIT_WICKET,
    RETIRED_OUT, OBSTRUCTING_FIELD, TIMED_OUT, HIT_BALL_TWICE, RETIRED_HURT;

    /** Wicket goes in the bowler's column (FR-SCR-10). */
    public boolean bowlerCredit() {
        return this == BOWLED || this == CAUGHT || this == CAUGHT_AND_BOWLED || this == LBW
                || this == STUMPED || this == HIT_WICKET;
    }

    /** Retired hurt is recorded as not out. */
    public boolean isWicket() { return this != RETIRED_HURT; }

    /** Retirements and timed out happen between deliveries: no ball is bowled. */
    public boolean offDelivery() { return this != RETIRED_OUT && this != RETIRED_HURT && this != TIMED_OUT; }
}
