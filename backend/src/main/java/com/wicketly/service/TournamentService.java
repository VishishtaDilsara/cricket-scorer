package com.wicketly.service;

import com.wicketly.domain.*;
import com.wicketly.repo.*;
import com.wicketly.service.Views.MatchSummary;
import com.wicketly.service.Views.TeamRef;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.*;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class TournamentService {
    public record TournamentReq(String name, String structure, Boolean doubleRound, LocalDate startDate, LocalDate endDate,
                                String venue, String ballType, Integer overs, Integer playersPerSide, Integer ballsPerOver,
                                Integer pointsWin, Integer pointsLoss, Integer pointsTie, Integer pointsNr, Integer qualifyPerGroup) {}
    public record TeamEntry(TeamRef team, String groupName) {}
    public record Row(UUID teamId, String name, String shortName, int played, int won, int lost, int tied, int noResult,
                      int points, double nrr, int adjustment, String mark) {}
    public record GroupTable(String group, boolean complete, List<Row> rows) {}
    public record Adjustment(UUID id, UUID teamId, String teamName, int pointsDelta, String reason, Instant createdAt) {}
    public record TournamentView(Tournament tournament, boolean canManage, List<TeamEntry> teams, List<MatchSummary> fixtures,
                                 List<GroupTable> tables, List<Adjustment> adjustments, Summary summary) {}
    /** A player award: who, for which team, the headline figure and a supporting line. */
    public record Award(UUID playerId, String name, TeamRef team, String headline, String detail) {}
    /** The end-of-tournament summary. Present only once the tournament is decided. */
    public record Summary(TeamRef champion, TeamRef runnerUp, String runnerUpNote, TeamRef secondRunnerUp, String secondRunnerUpNote,
                          Award playerOfSeries, Award bestBatter, Award bestBowler,
                          int matchesPlayed, int fours, int sixes, String highestScore, String bestBowling) {}
    public record TournamentCard(UUID id, String name, String structure, String status, LocalDate startDate, LocalDate endDate,
                                 String venue, int teams) {}

    private static final Set<String> DONE = Set.of("COMPLETED", "ABANDONED", "CANCELLED");
    private static final List<String> STRUCTURES = List.of("LEAGUE", "GROUPS_KNOCKOUT", "KNOCKOUT");

    private final TournamentRepo tournaments;
    private final TournamentTeamRepo tts;
    private final TeamRepo teams;
    private final MatchRepo matches;
    private final InningsRepo inningsRepo;
    private final TableAdjustmentRepo adjustments;
    private final AuditRepo audit;
    private final MatchService matchService;
    private final Access access;
    private final StatsService stats;
    private final TeamPlayerRepo teamPlayers;

    public TournamentService(TournamentRepo tournaments, TournamentTeamRepo tts, TeamRepo teams, MatchRepo matches,
                             InningsRepo inningsRepo, TableAdjustmentRepo adjustments, AuditRepo audit,
                             MatchService matchService, Access access, StatsService stats, TeamPlayerRepo teamPlayers) {
        this.stats = stats; this.teamPlayers = teamPlayers;
        this.tournaments = tournaments; this.tts = tts; this.teams = teams; this.matches = matches;
        this.inningsRepo = inningsRepo; this.adjustments = adjustments; this.audit = audit;
        this.matchService = matchService; this.access = access;
    }

    public Tournament get(UUID id) {
        return tournaments.findById(id).orElseThrow(() -> Api.notFound("Tournament"));
    }

    private Tournament managed(UUID id, Me me) {
        Tournament t = get(id);
        if (!access.canManage(me, t)) throw Api.forbidden();
        return t;
    }

    // ---------- read ----------

    /** Tournaments in one admin's space; empty when {@code org} is null (nobody signed in). */
    public List<TournamentCard> list(String q, UUID org) {
        if (org == null) return List.of();
        List<Tournament> list = q == null || q.isBlank() ? tournaments.findTop50ByOwnerIdOrderByCreatedAtDesc(org)
                : tournaments.findTop20ByOwnerIdAndNameContainingIgnoreCaseOrderByName(org, q.trim());
        return list.stream().map(t -> new TournamentCard(t.id, t.name, t.structure, t.status, t.startDate, t.endDate, t.venue,
                tts.findByTournamentId(t.id).size())).toList();
    }

    public TournamentView view(UUID id, Me me) {
        Tournament t = get(id);
        List<TournamentTeam> entries = tts.findByTournamentId(id);
        Map<UUID, Team> teamMap = teamMap(entries);
        List<Match> ms = matches.findByTournamentIdOrderBySortOrder(id);
        List<TeamEntry> teamViews = entries.stream()
                .map(e -> new TeamEntry(MatchService.ref(teamMap.get(e.teamId)), e.groupName))
                .sorted(Comparator.comparing((TeamEntry e) -> e.groupName() == null ? "" : e.groupName()).thenComparing(e -> e.team().name()))
                .toList();
        List<Adjustment> adj = adjustments.findByTournamentIdOrderByCreatedAt(id).stream()
                .map(a -> new Adjustment(a.id, a.teamId, teamMap.containsKey(a.teamId) ? teamMap.get(a.teamId).name : "", a.pointsDelta, a.reason, a.createdAt))
                .toList();
        List<GroupTable> tables = tables(t, entries, ms, teamMap);
        return new TournamentView(t, access.canManage(me, t), teamViews, matchService.summaries(ms), tables, adj, summary(t, ms, tables, teamMap));
    }

    // ---------- end-of-tournament summary ----------

    private Summary summary(Tournament t, List<Match> ms, List<GroupTable> tables, Map<UUID, Team> teamMap) {
        if (ms.isEmpty()) return null;
        Match fin = ms.stream().filter(m -> "F".equals(m.code)).findFirst().orElse(null);
        UUID champ, runner, third = null;
        String thirdNote = null;
        if (fin != null) {
            if (!"COMPLETED".equals(fin.state) || fin.winnerId == null) return null;
            champ = fin.winnerId;
            runner = fin.winnerId.equals(fin.teamAId) ? fin.teamBId : fin.teamAId;
            List<UUID> sfLosers = ms.stream().filter(m -> m.code != null && m.code.startsWith("SF") && m.winnerId != null)
                    .map(m -> m.winnerId.equals(m.teamAId) ? m.teamBId : m.teamAId).filter(Objects::nonNull).toList();
            if (sfLosers.size() == 1) { third = sfLosers.get(0); thirdNote = "Losing semi-finalist"; }
            else if (sfLosers.size() > 1) {
                Map<UUID, double[]> rank = standing(tables, ms);
                third = sfLosers.stream().min(Comparator.comparingDouble((UUID id) -> rank.getOrDefault(id, new double[] {99, 0, 0})[0])
                        .thenComparingDouble(id -> -rank.getOrDefault(id, new double[] {99, 0, 0})[1])
                        .thenComparingDouble(id -> -rank.getOrDefault(id, new double[] {99, 0, 0})[2])).orElse(null);
                thirdNote = tables.isEmpty() ? "Better net run rate of the two losing semi-finalists"
                        : "Better group-stage record of the two losing semi-finalists";
            }
        } else {
            // A league with no knockouts is decided once every match is done; places come from the table.
            if (!ms.stream().allMatch(m -> DONE.contains(m.state)) || tables.isEmpty()) return null;
            List<Row> order = tables.stream().flatMap(g -> g.rows().stream())
                    .sorted(Comparator.comparingInt((Row r) -> -r.points()).thenComparingInt(r -> -r.won()).thenComparingDouble(r -> -r.nrr())).toList();
            if (order.isEmpty()) return null;
            champ = order.get(0).teamId();
            runner = order.size() > 1 ? order.get(1).teamId() : null;
            third = order.size() > 2 ? order.get(2).teamId() : null;
            thirdNote = third == null ? null : "Third on the points table";
        }

        List<Match> played = ms.stream().filter(m -> "COMPLETED".equals(m.state)).toList();
        Collection<StatsService.Agg> all = stats.aggregate(played).values();
        Set<UUID> tournamentTeams = teamMap.keySet();
        java.util.function.Function<UUID, TeamRef> teamOf = pid -> teamPlayers.findByPlayerId(pid).stream()
                .map(tp -> tp.teamId).filter(tournamentTeams::contains).findFirst().map(id -> MatchService.ref(teamMap.get(id))).orElse(null);
        StatsService.Agg mvp = all.stream().filter(a -> a.mvp() > 0).max(Comparator.comparingInt(StatsService.Agg::mvp).thenComparingInt(a -> a.runs)).orElse(null);
        StatsService.Agg bat = all.stream().filter(a -> a.runs > 0)
                .max(Comparator.comparingInt((StatsService.Agg a) -> a.runs).thenComparingDouble(a -> a.getStrikeRate() == null ? 0 : a.getStrikeRate())).orElse(null);
        StatsService.Agg bowl = all.stream().filter(a -> a.wickets > 0).min(StatsService.Agg.BOWLING).orElse(null);
        Award pos = mvp == null ? null : new Award(mvp.playerId, mvp.name, teamOf.apply(mvp.playerId), mvp.mvp() + " impact points",
                mvp.runs + " runs · " + mvp.wickets + " wickets · " + (mvp.catches + mvp.runOuts + mvp.stumpings) + " dismissals in the field");
        Award bb = bat == null ? null : new Award(bat.playerId, bat.name, teamOf.apply(bat.playerId), bat.runs + " runs",
                bat.innings + " innings · highest " + bat.getHighestScore() + " · SR " + fmt(bat.getStrikeRate()) + (bat.getAverage() != null ? " · avg " + fmt(bat.getAverage()) : ""));
        Award bw = bowl == null ? null : new Award(bowl.playerId, bowl.name, teamOf.apply(bowl.playerId), bowl.wickets + (bowl.wickets == 1 ? " wicket" : " wickets"),
                "Best " + bowl.getBest() + " · economy " + fmt(bowl.getEconomy()) + (bowl.getBowlingAverage() != null ? " · avg " + fmt(bowl.getBowlingAverage()) : ""));
        StatsService.Agg hs = all.stream().filter(a -> a.innings > 0).max(Comparator.comparingInt((StatsService.Agg a) -> a.highest)).orElse(null);
        StatsService.Agg bf = all.stream().filter(a -> a.bestWickets >= 0).min(StatsService.Agg.BEST_FIGURES).orElse(null);
        return new Summary(ref(teamMap, champ), ref(teamMap, runner), fin != null ? "Lost the final" : "Second on the points table", ref(teamMap, third), thirdNote, pos, bb, bw, played.size(),
                all.stream().mapToInt(a -> a.fours).sum(), all.stream().mapToInt(a -> a.sixes).sum(),
                hs == null ? null : hs.getHighestScore() + " by " + hs.name, bf == null || bf.bestWickets <= 0 ? null : bf.getBest() + " by " + bf.name);
    }

    private static TeamRef ref(Map<UUID, Team> teamMap, UUID id) {
        return id == null ? null : MatchService.ref(teamMap.get(id));
    }

    private static String fmt(Double d) { return d == null ? "-" : String.format("%.2f", d); }

    /** For ranking teams knocked out in the same round: [group position, points, net run rate]. */
    private Map<UUID, double[]> standing(List<GroupTable> tables, List<Match> ms) {
        Map<UUID, double[]> out = new HashMap<>();
        for (GroupTable g : tables)
            for (int k = 0; k < g.rows().size(); k++) { Row r = g.rows().get(k); out.put(r.teamId(), new double[] {k, r.points(), r.nrr()}); }
        if (!out.isEmpty()) return out;
        // Straight knockout: net run rate over every completed match in the tournament.
        Map<UUID, double[]> acc = new HashMap<>(); // runsFor, oversFaced, runsAgainst, oversBowled
        Map<UUID, List<Innings>> inns = inningsRepo.findByMatchIdInOrderByInningsNo(ms.stream().map(m -> m.id).toList())
                .stream().collect(Collectors.groupingBy(i -> i.matchId));
        for (Match m : ms) {
            if (!"COMPLETED".equals(m.state)) continue;
            for (Innings i : inns.getOrDefault(m.id, List.of())) {
                double ov = i.legalBalls / (double) m.ballsPerOver;
                acc.computeIfAbsent(i.battingTeamId, k -> new double[4]); acc.computeIfAbsent(i.bowlingTeamId, k -> new double[4]);
                acc.get(i.battingTeamId)[0] += i.runs; acc.get(i.battingTeamId)[1] += ov;
                acc.get(i.bowlingTeamId)[2] += i.runs; acc.get(i.bowlingTeamId)[3] += ov;
            }
        }
        acc.forEach((id, a) -> out.put(id, new double[] {0, 0, (a[1] > 0 ? a[0] / a[1] : 0) - (a[3] > 0 ? a[2] / a[3] : 0)}));
        return out;
    }

    private Map<UUID, Team> teamMap(List<TournamentTeam> entries) {
        return teams.findAllById(entries.stream().map(e -> e.teamId).toList()).stream().collect(Collectors.toMap(x -> x.id, x -> x));
    }

    private static final class Acc {
        final Team team;
        int played, won, lost, tied, nr, adj;
        double runsFor, oversFaced, runsAgainst, oversBowled;
        Acc(Team team) { this.team = team; }
        double nrr() { return (oversFaced > 0 ? runsFor / oversFaced : 0) - (oversBowled > 0 ? runsAgainst / oversBowled : 0); }
    }

    /** Points tables, one per group. Net run rate follows section 5.3 of the specification. */
    public List<GroupTable> tables(Tournament t, List<TournamentTeam> entries, List<Match> ms, Map<UUID, Team> teamMap) {
        if (t.structure.equals("KNOCKOUT")) return List.of();
        Map<String, List<TournamentTeam>> groups = new TreeMap<>();
        for (TournamentTeam e : entries) groups.computeIfAbsent(groupOf(t, e.groupName), k -> new ArrayList<>()).add(e);
        Map<UUID, List<Innings>> inns = inningsRepo.findByMatchIdInOrderByInningsNo(ms.stream().map(m -> m.id).toList())
                .stream().collect(Collectors.groupingBy(i -> i.matchId));
        Map<UUID, Integer> adj = new HashMap<>();
        adjustments.findByTournamentIdOrderByCreatedAt(t.id).forEach(a -> adj.merge(a.teamId, a.pointsDelta, Integer::sum));

        List<GroupTable> out = new ArrayList<>();
        for (var g : groups.entrySet()) {
            Map<UUID, Acc> acc = new LinkedHashMap<>();
            for (TournamentTeam e : g.getValue()) if (teamMap.containsKey(e.teamId)) acc.put(e.teamId, new Acc(teamMap.get(e.teamId)));
            List<Match> gm = ms.stream().filter(m -> "GROUP".equals(m.stage) && g.getKey().equals(groupOf(t, m.groupName))).toList();
            for (Match m : gm) {
                Acc a = acc.get(m.teamAId), b = acc.get(m.teamBId);
                if (a == null || b == null || !(m.state.equals("COMPLETED") || m.state.equals("ABANDONED"))) continue;
                a.played++; b.played++;
                if ("WIN".equals(m.resultType) && m.winnerId != null) {
                    (m.winnerId.equals(m.teamAId) ? a : b).won++;
                    (m.winnerId.equals(m.teamAId) ? b : a).lost++;
                } else if ("TIE".equals(m.resultType)) { a.tied++; b.tied++; }
                else { a.nr++; b.nr++; continue; } // abandoned and no-result matches are left out of NRR
                List<Innings> two = inns.getOrDefault(m.id, List.of());
                if (two.size() < 2) continue; // walkover or forfeit: no cricket played
                Innings i1 = two.get(0), i2 = two.get(1);
                double bpo = m.ballsPerOver;
                int maxW = MatchService.rules(m, null).maxWickets();
                double q1 = i1.revisedOvers != null ? i1.revisedOvers : m.overs, q2 = i2.revisedOvers != null ? i2.revisedOvers : m.overs;
                double r1 = i1.runs, o1 = i1.wickets >= maxW ? q1 : i1.legalBalls / bpo;
                if (i2.targetRevised && i2.target != null) { r1 = i2.target - 1; o1 = q2; }
                double r2 = i2.runs, o2 = i2.wickets >= maxW ? q2 : i2.legalBalls / bpo;
                Acc first = acc.get(i1.battingTeamId), second = acc.get(i2.battingTeamId);
                if (first == null || second == null) continue;
                first.runsFor += r1; first.oversFaced += o1; first.runsAgainst += r2; first.oversBowled += o2;
                second.runsFor += r2; second.oversFaced += o2; second.runsAgainst += r1; second.oversBowled += o1;
            }
            acc.values().forEach(a -> a.adj = adj.getOrDefault(a.team.id, 0));
            List<Acc> sorted = new ArrayList<>(acc.values());
            sorted.sort(Comparator.comparingInt((Acc a) -> -points(t, a)).thenComparingInt(a -> -a.won)
                    .thenComparingDouble(a -> -a.nrr()).thenComparing(a -> a.team.name));
            // Final tie-break: head-to-head between two teams still level.
            for (int k = 0; k + 1 < sorted.size(); k++) {
                Acc x = sorted.get(k), y = sorted.get(k + 1);
                if (points(t, x) != points(t, y) || x.won != y.won || Math.abs(x.nrr() - y.nrr()) > 1e-9) continue;
                long xw = gm.stream().filter(m -> involves(m, x, y) && x.team.id.equals(m.winnerId)).count();
                long yw = gm.stream().filter(m -> involves(m, x, y) && y.team.id.equals(m.winnerId)).count();
                if (yw > xw) Collections.swap(sorted, k, k + 1);
            }
            boolean complete = !gm.isEmpty() && gm.stream().allMatch(m -> DONE.contains(m.state));
            List<Row> rows = new ArrayList<>();
            for (int k = 0; k < sorted.size(); k++) {
                Acc a = sorted.get(k);
                String mark = !complete || t.qualifyPerGroup <= 0 ? null : k < t.qualifyPerGroup ? "Q" : "E";
                rows.add(new Row(a.team.id, a.team.name, a.team.shortName, a.played, a.won, a.lost, a.tied, a.nr,
                        points(t, a), Math.round(a.nrr() * 1000) / 1000.0, a.adj, mark));
            }
            out.add(new GroupTable(g.getKey(), complete, rows));
        }
        return out;
    }

    private static boolean involves(Match m, Acc x, Acc y) {
        return (x.team.id.equals(m.teamAId) && y.team.id.equals(m.teamBId)) || (y.team.id.equals(m.teamAId) && x.team.id.equals(m.teamBId));
    }

    private static int points(Tournament t, Acc a) {
        return a.won * t.pointsWin + a.lost * t.pointsLoss + a.tied * t.pointsTie + a.nr * t.pointsNr + a.adj;
    }

    private static String groupOf(Tournament t, String name) {
        return name == null || t.structure.equals("LEAGUE") ? "League" : name;
    }

    // ---------- setup ----------

    public Tournament create(TournamentReq r, Me me) {
        access.requireAdmin(me);
        Tournament t = new Tournament();
        t.ownerId = me.org();
        t.structure = "LEAGUE";
        apply(t, r);
        if (t.name == null || t.name.isBlank()) throw Api.bad("Tournament name is required");
        return tournaments.save(t);
    }

    public Tournament update(UUID id, TournamentReq r, Me me) {
        Tournament t = managed(id, me);
        if (r.structure() != null && !r.structure().equals(t.structure) && !matches.findByTournamentIdOrderBySortOrder(id).isEmpty())
            throw Api.conflict("The structure cannot change once fixtures exist");
        apply(t, r);
        return t;
    }

    private static void apply(Tournament t, TournamentReq r) {
        if (r.name() != null) t.name = r.name().trim();
        if (r.structure() != null) {
            if (!STRUCTURES.contains(r.structure())) throw Api.bad("Unknown structure");
            t.structure = r.structure();
        }
        if (r.doubleRound() != null) t.doubleRound = r.doubleRound();
        if (r.startDate() != null) t.startDate = r.startDate();
        if (r.endDate() != null) t.endDate = r.endDate();
        if (r.venue() != null) t.venue = r.venue();
        if (r.ballType() != null) t.ballType = r.ballType();
        if (r.overs() != null) t.overs = Math.max(1, Math.min(100, r.overs()));
        if (r.playersPerSide() != null) t.playersPerSide = Math.max(2, Math.min(11, r.playersPerSide()));
        if (r.ballsPerOver() != null) t.ballsPerOver = Math.max(4, Math.min(10, r.ballsPerOver()));
        if (r.pointsWin() != null) t.pointsWin = r.pointsWin();
        if (r.pointsLoss() != null) t.pointsLoss = r.pointsLoss();
        if (r.pointsTie() != null) t.pointsTie = r.pointsTie();
        if (r.pointsNr() != null) t.pointsNr = r.pointsNr();
        if (r.qualifyPerGroup() != null) t.qualifyPerGroup = Math.max(0, r.qualifyPerGroup());
    }

    public void delete(UUID id, Me me) {
        tournaments.delete(managed(id, me));
    }

    public void addTeam(UUID id, UUID teamId, String name, Me me) {
        Tournament t = managed(id, me);
        Team team = teamId != null ? teams.findById(teamId).filter(x -> Access.sameOrg(me, x.ownerId)).orElseThrow(() -> Api.notFound("Team"))
                : teams.save(MatchService.newTeam(Optional.ofNullable(name).filter(n -> !n.isBlank()).orElseThrow(() -> Api.bad("Team name is required")), t.ownerId));
        if (tts.findByTournamentIdAndTeamId(id, team.id).isPresent()) return;
        TournamentTeam e = new TournamentTeam();
        e.tournamentId = t.id;
        e.teamId = team.id;
        tts.save(e);
    }

    public void removeTeam(UUID id, UUID teamId, Me me) {
        managed(id, me);
        if (matches.findByTournamentIdOrderBySortOrder(id).stream().anyMatch(m -> teamId.equals(m.teamAId) || teamId.equals(m.teamBId)))
            throw Api.conflict("This team already has fixtures; regenerate or delete them first");
        tts.findByTournamentIdAndTeamId(id, teamId).ifPresent(tts::delete);
    }

    public void setGroup(UUID id, UUID teamId, String group, Me me) {
        managed(id, me);
        TournamentTeam e = tts.findByTournamentIdAndTeamId(id, teamId).orElseThrow(() -> Api.notFound("Team"));
        e.groupName = group == null || group.isBlank() ? null : group.trim().replace(":", "");
    }

    /** Random draw into N groups named A, B, C... (FR-TRN-05). */
    public void draw(UUID id, int groupCount, Me me) {
        managed(id, me);
        List<TournamentTeam> entries = new ArrayList<>(tts.findByTournamentId(id));
        if (groupCount < 1 || groupCount > Math.max(1, entries.size() / 2)) throw Api.bad("Choose a number of groups that leaves at least two teams in each");
        Collections.shuffle(entries);
        for (int k = 0; k < entries.size(); k++) entries.get(k).groupName = String.valueOf((char) ('A' + k % groupCount));
    }

    public void adjust(UUID id, UUID teamId, int delta, String reason, Me me) {
        Tournament t = managed(id, me);
        if (reason == null || reason.isBlank()) throw Api.bad("A reason is required");
        tts.findByTournamentIdAndTeamId(id, teamId).orElseThrow(() -> Api.notFound("Team"));
        TableAdjustment a = new TableAdjustment();
        a.tournamentId = t.id; a.teamId = teamId; a.pointsDelta = delta; a.reason = reason.trim(); a.createdBy = me.id();
        adjustments.save(a);
        AuditEntry log = new AuditEntry();
        log.userId = me.id(); log.entity = "points_table"; log.entityId = t.id; log.action = "ADJUST";
        log.newValue = "team=" + teamId + " points=" + delta + " reason=" + a.reason;
        audit.save(log);
    }

    // ---------- fixtures ----------

    public void generateFixtures(UUID id, Me me) {
        Tournament t = managed(id, me);
        List<Match> existing = matches.findByTournamentIdOrderBySortOrder(id);
        if (existing.stream().anyMatch(m -> !m.state.equals("SCHEDULED")))
            throw Api.conflict("Matches have already started, so fixtures can no longer be regenerated");
        matches.deleteAll(existing);
        matches.flush();
        List<TournamentTeam> entries = tts.findByTournamentId(id);
        if (entries.size() < 2) throw Api.bad("Add at least two teams first");
        LocalDate day0 = t.startDate != null ? t.startDate : LocalDate.now().plusDays(1);
        List<Match> out = new ArrayList<>();

        if (t.structure.equals("KNOCKOUT")) {
            knockout(t, entries.stream().map(e -> "T:" + e.teamId).toList(), day0, out);
        } else {
            Map<String, List<UUID>> groups = new TreeMap<>();
            for (TournamentTeam e : entries) {
                if (t.structure.equals("LEAGUE")) e.groupName = "League";
                else if (e.groupName == null) throw Api.bad("Place every team in a group first, or run the draw");
                groups.computeIfAbsent(e.groupName, k -> new ArrayList<>()).add(e.teamId);
            }
            Map<String, List<List<UUID[]>>> rounds = new LinkedHashMap<>();
            int maxRounds = 0;
            for (var g : groups.entrySet()) {
                if (g.getValue().size() < 2) throw Api.bad("Group " + g.getKey() + " needs at least two teams");
                if (t.qualifyPerGroup > g.getValue().size()) throw Api.bad("More teams qualify than group " + g.getKey() + " contains");
                List<List<UUID[]>> rr = roundRobin(g.getValue(), t.doubleRound);
                rounds.put(g.getKey(), rr);
                maxRounds = Math.max(maxRounds, rr.size());
            }
            for (int r = 0; r < maxRounds; r++) {
                int slot = 0;
                for (var g : rounds.entrySet()) {
                    if (r >= g.getValue().size()) continue;
                    for (UUID[] pair : g.getValue().get(r)) {
                        Match m = fixture(t, out.size(), day0.plusDays(r), slot++);
                        m.stage = "GROUP";
                        m.groupName = g.getKey();
                        m.label = (t.structure.equals("LEAGUE") ? "League" : "Group " + g.getKey()) + " · Round " + (r + 1);
                        m.teamAId = pair[0];
                        m.teamBId = pair[1];
                        out.add(m);
                    }
                }
            }
            List<String> seeds = new ArrayList<>();
            for (int pos = 1; pos <= t.qualifyPerGroup; pos++) for (String g : groups.keySet()) seeds.add("G:" + g + ":" + pos);
            if (seeds.size() >= 2) knockout(t, seeds, day0.plusDays(maxRounds), out);
        }
        matches.saveAll(out);
        t.status = "FIXTURES";
    }

    /** Circle method: every team meets every other team once (twice for a double round-robin). */
    static List<List<UUID[]>> roundRobin(List<UUID> ids, boolean doubleRound) {
        List<UUID> l = new ArrayList<>(ids);
        if (l.size() % 2 == 1) l.add(null);
        int n = l.size();
        List<List<UUID[]>> rounds = new ArrayList<>();
        for (int r = 0; r < n - 1; r++) {
            List<UUID[]> round = new ArrayList<>();
            for (int k = 0; k < n / 2; k++) {
                UUID a = l.get(k), b = l.get(n - 1 - k);
                if (a != null && b != null) round.add(r % 2 == 0 ? new UUID[] {a, b} : new UUID[] {b, a});
            }
            rounds.add(round);
            l.add(1, l.remove(n - 1));
        }
        if (doubleRound) {
            int single = rounds.size();
            for (int r = 0; r < single; r++) rounds.add(rounds.get(r).stream().map(p -> new UUID[] {p[1], p[0]}).toList());
        }
        return rounds;
    }

    /**
     * Builds a seeded single-elimination bracket. A source is "T:teamId" (known team), "G:group:position"
     * (filled when the group finishes) or "W:code" (winner of an earlier knockout match). Missing seeds get byes.
     */
    private void knockout(Tournament t, List<String> sources, LocalDate startDay, List<Match> out) {
        int p = 1;
        while (p < sources.size()) p *= 2;
        List<Integer> order = new ArrayList<>(List.of(0));
        while (order.size() < p) {
            int size = order.size() * 2;
            List<Integer> next = new ArrayList<>();
            for (int x : order) { next.add(x); next.add(size - 1 - x); }
            order = next;
        }
        List<String> cur = new ArrayList<>();
        for (int x : order) cur.add(x < sources.size() ? sources.get(x) : null);
        int day = 0;
        while (cur.size() > 1) {
            int n = cur.size() / 2, k = 0;
            String roundName = n == 1 ? "Final" : n == 2 ? "Semi-final" : n == 4 ? "Quarter-final" : "Round of " + cur.size();
            String prefix = n == 2 ? "SF" : n == 4 ? "QF" : "R" + cur.size() + "-";
            List<String> next = new ArrayList<>();
            for (int i = 0; i < n; i++) {
                String a = cur.get(2 * i), b = cur.get(2 * i + 1);
                if (a == null || b == null) { next.add(a != null ? a : b); continue; }
                k++;
                Match m = fixture(t, out.size(), startDay.plusDays(day), k - 1);
                m.stage = "KNOCKOUT";
                m.code = n == 1 ? "F" : prefix + k;
                m.label = n == 1 ? "Final" : roundName + " " + k;
                m.sourceA = a;
                m.sourceB = b;
                if (a.startsWith("T:")) m.teamAId = UUID.fromString(a.substring(2));
                if (b.startsWith("T:")) m.teamBId = UUID.fromString(b.substring(2));
                out.add(m);
                next.add("W:" + m.code);
            }
            if (k > 0) day++;
            cur = next;
        }
    }

    private static Match fixture(Tournament t, int order, LocalDate day, int slot) {
        Match m = new Match();
        m.tournamentId = t.id;
        m.createdBy = t.ownerId;
        m.ownerId = t.ownerId;
        m.sortOrder = order;
        m.overs = t.overs; m.playersPerSide = t.playersPerSide; m.ballsPerOver = t.ballsPerOver;
        m.maxOversPerBowler = (int) Math.ceil(t.overs / 5.0);
        m.format = t.overs + " overs";
        m.ground = t.venue;
        m.scheduledAt = day.atTime(LocalTime.of(9, 0).plusHours(4L * (slot % 3))).atZone(ZoneId.systemDefault()).toInstant();
        return m;
    }

    // ---------- progression ----------

    public void markLive(Match m) {
        if (m.tournamentId == null) return;
        tournaments.findById(m.tournamentId).filter(t -> !t.status.equals("COMPLETED")).ifPresent(t -> t.status = "LIVE");
    }

    /** After a result: fill knockout slots from finished groups and from knockout winners (FR-TRN-15, FR-TRN-18). */
    public void onResult(Match m) {
        if (m.tournamentId == null) return;
        Tournament t = get(m.tournamentId);
        matches.flush();
        List<Match> all = matches.findByTournamentIdOrderBySortOrder(t.id);
        List<Match> open = all.stream().filter(x -> "KNOCKOUT".equals(x.stage) && x.state.equals("SCHEDULED")).toList();
        if ("GROUP".equals(m.stage)) {
            List<TournamentTeam> entries = tts.findByTournamentId(t.id);
            for (GroupTable table : tables(t, entries, all, teamMap(entries))) {
                if (!table.complete()) continue;
                for (int pos = 1; pos <= table.rows().size(); pos++) {
                    String src = "G:" + table.group() + ":" + pos;
                    UUID team = table.rows().get(pos - 1).teamId();
                    for (Match x : open) {
                        if (src.equals(x.sourceA)) x.teamAId = team;
                        if (src.equals(x.sourceB)) x.teamBId = team;
                    }
                }
            }
        } else if ("KNOCKOUT".equals(m.stage) && m.code != null) {
            // A tied knockout has no winner, so the bracket waits for a super over or organiser decision.
            String src = "W:" + m.code;
            for (Match x : open) {
                if (src.equals(x.sourceA)) x.teamAId = m.winnerId;
                if (src.equals(x.sourceB)) x.teamBId = m.winnerId;
            }
            if (m.code.equals("F") && m.winnerId != null) t.status = "COMPLETED";
        }
        if (!t.status.equals("COMPLETED")) t.status = "LIVE";
    }
}
