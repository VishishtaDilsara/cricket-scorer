package com.wicketly.engine;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/** Everything derived from an innings' ball records. Names are filled in by the service layer. */
public class InningsState {
    public int runs, wickets, legalBalls;
    public int wides, noBalls, byes, legByes, penalties;
    public String oversText = "0.0";
    public List<Batter> batters = new ArrayList<>();
    public List<Bowler> bowlers = new ArrayList<>();
    public List<Fow> fow = new ArrayList<>();
    public List<Partnership> partnerships = new ArrayList<>();
    public List<Over> overs = new ArrayList<>();
    public boolean freeHitNext, complete, allOut, overComplete;
    public UUID nextStriker, nextNonStriker, lastOverBowler;

    public int extras() { return wides + noBalls + byes + legByes + penalties; }

    public static class Batter {
        public UUID playerId; public String name;
        public int runs, balls, fours, sixes;
        public Dismissal dismissal; public UUID bowlerId, fielderId; public String howOut;
        public boolean out() { return dismissal != null && dismissal.isWicket(); }
    }

    public static class Bowler {
        public UUID playerId; public String name;
        public int balls, maidens, runs, wickets, wides, noBalls;
    }

    public static class Fow {
        public int wicket, score; public UUID playerId; public String name, over;
    }

    public static class Partnership {
        public UUID batterA, batterB; public String nameA, nameB;
        public int runs, balls;
    }

    public static class Over {
        public int number; public UUID bowlerId; public String bowlerName;
        public int runs, wickets;
        public List<String> balls = new ArrayList<>();
        transient int conceded; transient Set<UUID> bowledBy = new HashSet<>();
    }
}
