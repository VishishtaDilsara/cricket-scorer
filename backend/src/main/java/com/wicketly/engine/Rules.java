package com.wicketly.engine;

public record Rules(int overs, int ballsPerOver, int playersPerSide, int maxOversPerBowler,
                    int wideRuns, int noBallRuns, boolean freeHit, boolean lastManStands) {
    public int maxWickets() { return lastManStands ? playersPerSide : playersPerSide - 1; }
    public int maxBalls() { return overs * ballsPerOver; }
}
