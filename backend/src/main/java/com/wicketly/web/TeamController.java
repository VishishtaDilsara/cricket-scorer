package com.wicketly.web;

import com.wicketly.domain.*;
import com.wicketly.repo.*;
import com.wicketly.service.*;
import com.wicketly.service.Views.MatchSummary;
import com.wicketly.service.Views.TeamRef;
import java.util.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
@Transactional
public class TeamController {
    public record TeamReq(String name, String shortName, String homeGround) {}
    public record PlayerReq(UUID id, UUID playerId, String name, String battingHand, String bowlingStyle, String playerRole) {}
    public record Record(int played, int won, int lost, int tied, int noResult) {}
    public record TeamView(Team team, boolean canEdit, List<Player> players, Record record, List<MatchSummary> matches) {}
    public record PlayerView(Player player, List<TeamRef> teams, StatsService.Agg stats, List<MatchSummary> matches, boolean canEdit,
                             StatsService.Profile profile, boolean canReport) {}

    private final TeamRepo teams;
    private final PlayerRepo players;
    private final TeamPlayerRepo teamPlayers;
    private final MatchRepo matches;
    private final MatchService matchService;
    private final StatsService stats;
    private final Access access;

    public TeamController(TeamRepo teams, PlayerRepo players, TeamPlayerRepo teamPlayers, MatchRepo matches,
                          MatchService matchService, StatsService stats, Access access) {
        this.teams = teams; this.players = players; this.teamPlayers = teamPlayers; this.matches = matches;
        this.matchService = matchService; this.stats = stats; this.access = access;
    }

    /** Teams in the signed-in admin's space; empty for visitors who are not signed in. */
    @GetMapping("/teams")
    List<TeamRef> list(@RequestParam(required = false) String q, @AuthenticationPrincipal Jwt jwt) {
        UUID org = Me.orgOf(Me.of(jwt));
        if (org == null) return List.of();
        List<Team> list = q == null || q.isBlank() ? teams.findTop100ByOwnerIdOrderByCreatedAtDesc(org)
                : teams.findTop20ByOwnerIdAndNameContainingIgnoreCaseOrderByName(org, q.trim());
        return list.stream().map(MatchService::ref).toList();
    }

    public record Squad(TeamRef team, List<Player> players) {}

    /** Every player in the admin's space grouped by team, teams A to Z. Players in no team come last (team = null). */
    @GetMapping("/squads")
    List<Squad> squads(@AuthenticationPrincipal Jwt jwt) {
        UUID org = Me.orgOf(Me.of(jwt));
        if (org == null) return List.of();
        List<Team> ts = new ArrayList<>(teams.findTop100ByOwnerIdOrderByCreatedAtDesc(org));
        ts.sort(Comparator.comparing((Team t) -> t.name.toLowerCase()));
        Map<UUID, Player> byId = new LinkedHashMap<>();
        players.findByOwnerIdOrderByName(org).forEach(p -> byId.put(p.id, p));
        Map<UUID, List<Player>> inTeam = new HashMap<>();
        Set<UUID> placed = new HashSet<>();
        for (TeamPlayer tp : teamPlayers.findByTeamIdIn(ts.stream().map(t -> t.id).toList())) {
            Player p = byId.get(tp.playerId);
            if (p == null) continue;
            inTeam.computeIfAbsent(tp.teamId, k -> new ArrayList<>()).add(p);
            placed.add(p.id);
        }
        List<Squad> out = new ArrayList<>();
        for (Team t : ts) {
            List<Player> ps = inTeam.getOrDefault(t.id, new ArrayList<>());
            ps.sort(Comparator.comparing((Player p) -> p.name.toLowerCase()));
            out.add(new Squad(MatchService.ref(t), ps));
        }
        List<Player> loose = byId.values().stream().filter(p -> !placed.contains(p.id)).toList();
        if (!loose.isEmpty()) out.add(new Squad(null, loose));
        return out;
    }

    @PostMapping("/teams")
    Map<String, UUID> create(@RequestBody TeamReq r, @AuthenticationPrincipal Jwt jwt) {
        Me me = Me.of(jwt);
        access.requireAdmin(me);
        if (r.name() == null || r.name().isBlank()) throw Api.bad("Team name is required");
        Team t = MatchService.newTeam(r.name(), me.org());
        apply(t, r);
        return Map.of("id", teams.save(t).id);
    }

    @GetMapping("/teams/{id}")
    TeamView view(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        Team t = team(id);
        List<Match> ms = matches.findByTeam(id);
        int won = 0, lost = 0, tied = 0, nr = 0;
        for (Match m : ms) {
            if (!(m.state.equals("COMPLETED") || m.state.equals("ABANDONED"))) continue;
            if ("WIN".equals(m.resultType)) { if (id.equals(m.winnerId)) won++; else lost++; }
            else if ("TIE".equals(m.resultType)) tied++;
            else nr++;
        }
        return new TeamView(t, access.canEdit(Me.of(jwt), t), players.findByTeam(id), new Record(won + lost + tied + nr, won, lost, tied, nr),
                matchService.summaries(ms.stream().limit(30).toList()));
    }

    @PutMapping("/teams/{id}")
    void update(@PathVariable UUID id, @RequestBody TeamReq r, @AuthenticationPrincipal Jwt jwt) {
        Team t = editable(id, jwt);
        if (r.name() != null && !r.name().isBlank()) t.name = r.name().trim();
        apply(t, r);
    }

    private static void apply(Team t, TeamReq r) {
        if (r.shortName() != null && !r.shortName().isBlank()) {
            String s = r.shortName().trim().toUpperCase();
            if (s.length() > 4) throw Api.bad("Short name is at most 4 letters");
            t.shortName = s;
        }
        if (r.homeGround() != null) t.homeGround = r.homeGround().trim();
    }

    /** Adds a player. Name-only is enough (FR-TEAM-03); a client-supplied id makes offline retries safe. */
    @PostMapping("/teams/{id}/players")
    Map<String, UUID> addPlayer(@PathVariable UUID id, @RequestBody PlayerReq r, @AuthenticationPrincipal Jwt jwt) {
        Team team = editable(id, jwt);
        Player p;
        if (r.playerId() != null || (r.id() != null && players.existsById(r.id()))) {
            p = players.findById(r.playerId() != null ? r.playerId() : r.id())
                    .filter(x -> team.ownerId.equals(x.ownerId)).orElseThrow(() -> Api.notFound("Player"));
        } else {
            if (r.name() == null || r.name().isBlank()) throw Api.bad("Player name is required");
            p = new Player();
            if (r.id() != null) p.id = r.id();
            p.name = r.name().trim();
            p.ownerId = team.ownerId;
            p.battingHand = r.battingHand(); p.bowlingStyle = r.bowlingStyle(); p.playerRole = r.playerRole();
            players.save(p);
        }
        if (teamPlayers.findByTeamIdAndPlayerId(id, p.id).isEmpty()) {
            TeamPlayer tp = new TeamPlayer();
            tp.teamId = id;
            tp.playerId = p.id;
            teamPlayers.save(tp);
        }
        return Map.of("id", p.id);
    }

    @DeleteMapping("/teams/{id}/players/{playerId}")
    void removePlayer(@PathVariable UUID id, @PathVariable UUID playerId, @AuthenticationPrincipal Jwt jwt) {
        editable(id, jwt);
        teamPlayers.findByTeamIdAndPlayerId(id, playerId).ifPresent(teamPlayers::delete);
    }

    @GetMapping("/players")
    List<Player> searchPlayers(@RequestParam String q, @AuthenticationPrincipal Jwt jwt) {
        UUID org = Me.orgOf(Me.of(jwt));
        if (org == null) return List.of();
        return players.findTop20ByOwnerIdAndNameContainingIgnoreCaseOrderByName(org, q.trim());
    }

    @GetMapping("/players/{id}")
    PlayerView player(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        Player p = players.findById(id).orElseThrow(() -> Api.notFound("Player"));
        List<Team> ts = teams.findAllById(teamPlayers.findByPlayerId(id).stream().map(tp -> tp.teamId).toList());
        Me me = Me.of(jwt);
        return new PlayerView(p, ts.stream().map(MatchService::ref).toList(), stats.career(id),
                matchService.summaries(stats.matchesOf(id)), access.canEdit(me, p),
                stats.profile(id), Access.sameOrg(me, p.ownerId));
    }

    @PutMapping("/players/{id}")
    void updatePlayer(@PathVariable UUID id, @RequestBody PlayerReq r, @AuthenticationPrincipal Jwt jwt) {
        Player p = players.findById(id).orElseThrow(() -> Api.notFound("Player"));
        if (!access.canEdit(Me.of(jwt), p)) throw Api.forbidden();
        if (r.name() != null && !r.name().isBlank()) p.name = r.name().trim();
        if (r.battingHand() != null) p.battingHand = r.battingHand();
        if (r.bowlingStyle() != null) p.bowlingStyle = r.bowlingStyle();
        if (r.playerRole() != null) p.playerRole = r.playerRole();
    }

    private Team team(UUID id) {
        return teams.findById(id).orElseThrow(() -> Api.notFound("Team"));
    }

    private Team editable(UUID id, Jwt jwt) {
        Team t = team(id);
        if (!access.canEdit(Me.of(jwt), t)) throw Api.forbidden();
        return t;
    }
}
