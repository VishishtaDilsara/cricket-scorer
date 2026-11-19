package com.wicketly.service;

import com.wicketly.domain.*;
import com.wicketly.engine.Dismissal;
import com.wicketly.engine.InningsState;
import com.wicketly.repo.*;
import java.util.*;
import java.util.function.Function;
import java.util.function.Predicate;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Career figures and leaderboards. Always derived from ball records, never stored. */
@Service
@Transactional(readOnly = true)
public class StatsService {
    public static class Agg {
        public UUID playerId;
        public String name;
        @com.fasterxml.jackson.annotation.JsonIgnore public Set<UUID> matchIds = new HashSet<>();
        public int innings, notOuts, runs, balls, highest, thirties, fifties, hundreds, fours, sixes;
        public boolean highestNotOut;
        public int bowlBalls, maidens, conceded, wickets, bestWickets = -1, bestRuns;
        public double bowlOvers;
        public int catches, runOuts, stumpings;

        public int getMatches() { return matchIds.size(); }
        public Double getAverage() { return innings - notOuts > 0 ? round(runs / (double) (innings - notOuts)) : null; }
        public Double getStrikeRate() { return balls > 0 ? round(runs * 100.0 / balls) : null; }
        public Double getEconomy() { return bowlOvers > 0 ? round(conceded / bowlOvers) : null; }
        public Double getBowlingAverage() { return wickets > 0 ? round(conceded / (double) wickets) : null; }
        public Double getBowlingStrikeRate() { return wickets > 0 ? round(bowlBalls / (double) wickets) : null; }
        public String getBest() { return bestWickets < 0 ? null : bestWickets + "/" + bestRuns; }
        public String getHighestScore() { return innings == 0 ? null : highest + (highestNotOut ? "*" : ""); }
        public int mvp() { return runs + 20 * wickets + 10 * (catches + runOuts + stumpings); }
        private static double round(double v) { return Math.round(v * 100) / 100.0; }
    }

    public record Entry(UUID playerId, String name, String value, String detail) {}
    public record Board(String key, String title, List<Entry> entries) {}

    private final InningsRepo inningsRepo;
    private final BallRepo balls;
    private final PlayerRepo players;
    private final MatchRepo matches;
    private final TeamRepo teams;

    public StatsService(InningsRepo inningsRepo, BallRepo balls, PlayerRepo players, MatchRepo matches, TeamRepo teams) {
        this.inningsRepo = inningsRepo; this.balls = balls; this.players = players; this.matches = matches; this.teams = teams;
    }

    /** One match in a player's career, oldest first, for the profile charts and the PDF report. */
    public record FormEntry(UUID matchId, java.time.Instant date, String opponent, boolean batted, int runs, int balls, boolean out,
                            String dismissal, int bowlBalls, int conceded, int wickets, int ballsPerOver) {}
    /** How the player's runs came: balls faced that went for 0, 1, 2, 3, 4, 6 or another number of runs. */
    public record Scoring(int dots, int ones, int twos, int threes, int fours, int sixes, int other) {}
    public record Profile(List<FormEntry> form, Scoring scoring, Map<String, Integer> dismissals) {}

    public Profile profile(UUID playerId) {
        Set<UUID> matchIds = inningsRepo.findAllById(balls.inningsOfPlayer(playerId)).stream().map(i -> i.matchId).collect(Collectors.toSet());
        List<Match> ms = matches.findAllById(matchIds).stream().filter(m -> !m.practice)
                .sorted(Comparator.comparing((Match m) -> m.scheduledAt != null ? m.scheduledAt : m.createdAt)).toList();
        int[] sc = new int[7];
        Map<String, Integer> outs = new LinkedHashMap<>();
        List<FormEntry> form = new ArrayList<>();
        if (ms.isEmpty()) return new Profile(form, new Scoring(0, 0, 0, 0, 0, 0, 0), outs);
        Map<UUID, Match> byId = ms.stream().collect(Collectors.toMap(m -> m.id, m -> m));
        List<Innings> inns = inningsRepo.findByMatchIdInOrderByInningsNo(byId.keySet());
        Map<UUID, List<Ball>> ballMap = balls.findByInningsIdInOrderBySeq(inns.stream().map(i -> i.id).toList())
                .stream().collect(Collectors.groupingBy(b -> b.inningsId));
        Map<UUID, List<Innings>> innsByMatch = inns.stream().collect(Collectors.groupingBy(i -> i.matchId));
        Set<UUID> teamIds = new HashSet<>();
        ms.forEach(m -> { if (m.teamAId != null) teamIds.add(m.teamAId); if (m.teamBId != null) teamIds.add(m.teamBId); });
        Map<UUID, String> teamNames = teams.findAllById(teamIds).stream().collect(Collectors.toMap(t -> t.id, t -> t.name));

        for (Match m : ms) {
            boolean batted = false, out = false; int runs = 0, faced = 0, bb = 0, conceded = 0, wk = 0;
            String dismissal = null, opponent = null;
            for (Innings i : innsByMatch.getOrDefault(m.id, List.of())) {
                List<Ball> list = ballMap.getOrDefault(i.id, List.of());
                InningsState st = MatchService.replay(m, i, list);
                for (InningsState.Batter b : st.batters) {
                    if (!b.playerId.equals(playerId)) continue;
                    batted = true; runs += b.runs; faced += b.balls; out = b.out();
                    opponent = teamNames.get(i.bowlingTeamId);
                    if (b.out()) { dismissal = b.dismissal.name(); outs.merge(dismissal, 1, Integer::sum); }
                }
                for (InningsState.Bowler b : st.bowlers) {
                    if (!b.playerId.equals(playerId)) continue;
                    bb += b.balls; conceded += b.runs; wk += b.wickets;
                    if (opponent == null) opponent = teamNames.get(i.battingTeamId);
                }
                for (Ball x : list) {
                    if (!playerId.equals(x.strikerId)) continue;
                    if (x.extraType != com.wicketly.engine.ExtraType.NONE && x.extraType != com.wicketly.engine.ExtraType.NO_BALL) continue;
                    if (x.dismissal != null && !x.dismissal.offDelivery()) continue; // retired or timed out: not a ball faced
                    switch (x.runsBat) {
                        case 0 -> { if (x.extraType == com.wicketly.engine.ExtraType.NONE) sc[0]++; }
                        case 1 -> sc[1]++; case 2 -> sc[2]++; case 3 -> sc[3]++; case 4 -> sc[4]++; case 6 -> sc[5]++;
                        default -> sc[6]++;
                    }
                }
            }
            if (!batted && bb == 0) continue;
            form.add(new FormEntry(m.id, m.scheduledAt != null ? m.scheduledAt : m.createdAt, opponent, batted, runs, faced, out,
                    dismissal, bb, conceded, wk, m.ballsPerOver));
        }
        return new Profile(form, new Scoring(sc[0], sc[1], sc[2], sc[3], sc[4], sc[5], sc[6]), outs);
    }

    public Map<UUID, Agg> aggregate(Collection<Match> ms) {
        Map<UUID, Agg> out = new HashMap<>();
        if (ms.isEmpty()) return out;
        Map<UUID, Match> byId = ms.stream().collect(Collectors.toMap(m -> m.id, m -> m));
        List<Innings> inns = inningsRepo.findByMatchIdInOrderByInningsNo(byId.keySet());
        if (inns.isEmpty()) return out;
        Map<UUID, List<Ball>> ballMap = balls.findByInningsIdInOrderBySeq(inns.stream().map(i -> i.id).toList())
                .stream().collect(Collectors.groupingBy(b -> b.inningsId));
        Function<UUID, Agg> agg = id -> out.computeIfAbsent(id, k -> { Agg a = new Agg(); a.playerId = k; return a; });

        for (Innings i : inns) {
            Match m = byId.get(i.matchId);
            InningsState st = MatchService.replay(m, i, ballMap.getOrDefault(i.id, List.of()));
            for (InningsState.Batter b : st.batters) {
                Agg a = agg.apply(b.playerId);
                a.matchIds.add(m.id);
                a.innings++;
                if (!b.out()) a.notOuts++;
                a.runs += b.runs; a.balls += b.balls; a.fours += b.fours; a.sixes += b.sixes;
                if (b.runs > a.highest || (b.runs == a.highest && !b.out())) { a.highest = b.runs; a.highestNotOut = !b.out(); }
                if (b.runs >= 100) a.hundreds++; else if (b.runs >= 50) a.fifties++; else if (b.runs >= 30) a.thirties++;
                if (b.dismissal == Dismissal.CAUGHT && b.fielderId != null) { Agg f = agg.apply(b.fielderId); f.catches++; f.matchIds.add(m.id); }
                if (b.dismissal == Dismissal.CAUGHT_AND_BOWLED && b.bowlerId != null) agg.apply(b.bowlerId).catches++;
                if (b.dismissal == Dismissal.STUMPED && b.fielderId != null) { Agg f = agg.apply(b.fielderId); f.stumpings++; f.matchIds.add(m.id); }
                if (b.dismissal == Dismissal.RUN_OUT && b.fielderId != null) { Agg f = agg.apply(b.fielderId); f.runOuts++; f.matchIds.add(m.id); }
            }
            for (InningsState.Bowler b : st.bowlers) {
                Agg a = agg.apply(b.playerId);
                a.matchIds.add(m.id);
                a.bowlBalls += b.balls; a.bowlOvers += b.balls / (double) m.ballsPerOver;
                a.maidens += b.maidens; a.conceded += b.runs; a.wickets += b.wickets;
                if (b.wickets > a.bestWickets || (b.wickets == a.bestWickets && b.runs < a.bestRuns)) { a.bestWickets = b.wickets; a.bestRuns = b.runs; }
            }
        }
        players.findAllById(out.keySet()).forEach(p -> out.get(p.id).name = p.name);
        out.values().forEach(a -> { if (a.name == null) a.name = "Unknown"; });
        return out;
    }

    /** Career figures across every non-practice match the player took part in. */
    public Agg career(UUID playerId) {
        Set<UUID> matchIds = inningsRepo.findAllById(balls.inningsOfPlayer(playerId)).stream().map(i -> i.matchId).collect(Collectors.toSet());
        List<Match> ms = matches.findAllById(matchIds).stream().filter(m -> !m.practice).toList();
        Agg a = aggregate(ms).get(playerId);
        if (a == null) { a = new Agg(); a.playerId = playerId; }
        return a;
    }

    public List<Match> matchesOf(UUID playerId) {
        Set<UUID> matchIds = inningsRepo.findAllById(balls.inningsOfPlayer(playerId)).stream().map(i -> i.matchId).collect(Collectors.toSet());
        return matches.findAllById(matchIds).stream()
                .sorted(Comparator.comparing((Match m) -> m.scheduledAt, Comparator.nullsLast(Comparator.reverseOrder()))).limit(10).toList();
    }

    public List<Board> leaderboards(List<Match> ms) {
        Collection<Agg> all = aggregate(ms).values();
        return List.of(
            board("runs", "Most runs", all, a -> a.runs > 0, Comparator.comparingInt((Agg a) -> -a.runs), a -> String.valueOf(a.runs), a -> a.innings + " inns · SR " + fmt(a.getStrikeRate())),
            board("wickets", "Most wickets", all, a -> a.wickets > 0, Comparator.comparingInt((Agg a) -> -a.wickets).thenComparingInt(a -> a.conceded), a -> String.valueOf(a.wickets), a -> "Econ " + fmt(a.getEconomy()) + " · Best " + a.getBest()),
            board("strikeRate", "Best strike rate", all, a -> a.balls >= 10, Comparator.comparingDouble((Agg a) -> -a.getStrikeRate()), a -> fmt(a.getStrikeRate()), a -> a.runs + " runs off " + a.balls),
            board("economy", "Best economy", all, a -> a.bowlBalls >= 12, Comparator.comparingDouble((Agg a) -> a.getEconomy()), a -> fmt(a.getEconomy()), a -> a.wickets + " wkts · " + a.bowlBalls + " balls"),
            board("sixes", "Most sixes", all, a -> a.sixes > 0, Comparator.comparingInt((Agg a) -> -a.sixes), a -> String.valueOf(a.sixes), a -> a.fours + " fours"),
            board("catches", "Most catches", all, a -> a.catches > 0, Comparator.comparingInt((Agg a) -> -a.catches), a -> String.valueOf(a.catches), a -> a.stumpings + " st · " + a.runOuts + " run outs"),
            board("mvp", "Most valuable player", all, a -> a.mvp() > 0, Comparator.comparingInt((Agg a) -> -a.mvp()), a -> String.valueOf(a.mvp()), a -> a.runs + " runs · " + a.wickets + " wkts · " + a.catches + " ct"));
    }

    private static Board board(String key, String title, Collection<Agg> all, Predicate<Agg> eligible, Comparator<Agg> order,
                               Function<Agg, String> value, Function<Agg, String> detail) {
        return new Board(key, title, all.stream().filter(eligible).sorted(order.thenComparing(a -> a.name)).limit(10)
                .map(a -> new Entry(a.playerId, a.name, value.apply(a), detail.apply(a))).toList());
    }

    private static String fmt(Double d) { return d == null ? "-" : String.format("%.2f", d); }
}
