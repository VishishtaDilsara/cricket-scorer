package com.wicketly.web;

import com.wicketly.domain.*;
import com.wicketly.repo.*;
import com.wicketly.service.*;
import com.wicketly.service.Views.MatchSummary;
import com.wicketly.service.Views.TeamRef;
import java.util.List;
import java.util.Map;
import java.util.UUID;
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
    public record PlayerView(Player player, List<TeamRef> teams, StatsService.Agg stats, List<MatchSummary> matches, boolean canEdit) {}

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

    @GetMapping("/teams")
    List<TeamRef> list(@RequestParam(required = false) String q) {
        List<Team> list = q == null || q.isBlank() ? teams.findTop50ByOrderByCreatedAtDesc() : teams.findTop20ByNameContainingIgnoreCaseOrderByName(q.trim());
        return list.stream().map(MatchService::ref).toList();
    }

    @PostMapping("/teams")
    Map<String, UUID> create(@RequestBody TeamReq r, @AuthenticationPrincipal Jwt jwt) {
        if (r.name() == null || r.name().isBlank()) throw Api.bad("Team name is required");
        Team t = MatchService.newTeam(r.name(), Me.of(jwt).id());
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
        editable(id, jwt);
        Player p;
        if (r.playerId() != null) {
            p = players.findById(r.playerId()).orElseThrow(() -> Api.notFound("Player"));
        } else if (r.id() != null && players.existsById(r.id())) {
            p = players.findById(r.id()).orElseThrow();
        } else {
            if (r.name() == null || r.name().isBlank()) throw Api.bad("Player name is required");
            p = new Player();
            if (r.id() != null) p.id = r.id();
            p.name = r.name().trim();
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
    List<Player> searchPlayers(@RequestParam String q) {
        return players.findTop20ByNameContainingIgnoreCaseOrderByName(q.trim());
    }

    @GetMapping("/players/{id}")
    PlayerView player(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        Player p = players.findById(id).orElseThrow(() -> Api.notFound("Player"));
        List<Team> ts = teams.findAllById(teamPlayers.findByPlayerId(id).stream().map(tp -> tp.teamId).toList());
        Me me = Me.of(jwt);
        return new PlayerView(p, ts.stream().map(MatchService::ref).toList(), stats.career(id),
                matchService.summaries(stats.matchesOf(id)), ts.stream().anyMatch(t -> access.canEdit(me, t)));
    }

    @PutMapping("/players/{id}")
    void updatePlayer(@PathVariable UUID id, @RequestBody PlayerReq r, @AuthenticationPrincipal Jwt jwt) {
        Player p = players.findById(id).orElseThrow(() -> Api.notFound("Player"));
        Me me = Me.of(jwt);
        boolean ok = teams.findAllById(teamPlayers.findByPlayerId(id).stream().map(tp -> tp.teamId).toList()).stream().anyMatch(t -> access.canEdit(me, t));
        if (!ok) throw Api.forbidden();
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
