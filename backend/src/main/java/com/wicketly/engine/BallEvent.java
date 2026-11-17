package com.wicketly.engine;

import java.util.UUID;

/**
 * One scoring event. extraRuns means: WIDE = runs run on top of the penalty; NO_BALL = byes/leg byes
 * run off the no-ball (kind in subExtra); BYE / LEG_BYE = the byes; PENALTY = penalty runs awarded.
 */
public record BallEvent(UUID id, UUID striker, UUID nonStriker, UUID bowler, int runsBat, ExtraType extra,
                        int extraRuns, ExtraType subExtra, Dismissal dismissal, UUID dismissed, UUID fielder) {

    public boolean isDelivery() {
        return extra != ExtraType.PENALTY && (dismissal == null || dismissal.offDelivery());
    }

    public boolean isLegal() {
        return isDelivery() && extra != ExtraType.WIDE && extra != ExtraType.NO_BALL;
    }
}
