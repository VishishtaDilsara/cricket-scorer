package com.wicketly.web;

import com.wicketly.repo.MatchRepo;
import com.wicketly.service.Me;
import com.wicketly.service.StatsService;
import com.wicketly.service.TournamentService;
import com.wicketly.service.TournamentService.*;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/tournaments")
public class TournamentController {
    public record TeamAdd(UUID teamId, String name) {}
    public record AdjustReq(UUID teamId, int pointsDelta, String reason) {}

    private final TournamentService service;
    private final StatsService stats;
    private final MatchRepo matches;

    public TournamentController(TournamentService service, StatsService stats, MatchRepo matches) {
        this.service = service; this.stats = stats; this.matches = matches;
    }

    @GetMapping
    List<TournamentCard> list(@RequestParam(required = false) String q, @AuthenticationPrincipal Jwt jwt) {
        return service.list(q, Me.orgOf(Me.of(jwt)));
    }

    @PostMapping
    Map<String, UUID> create(@RequestBody TournamentReq r, @AuthenticationPrincipal Jwt jwt) {
        return Map.of("id", service.create(r, Me.of(jwt)).id);
    }

    @GetMapping("/{id}")
    TournamentView view(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) { return service.view(id, Me.of(jwt)); }

    @PutMapping("/{id}")
    void update(@PathVariable UUID id, @RequestBody TournamentReq r, @AuthenticationPrincipal Jwt jwt) { service.update(id, r, Me.of(jwt)); }

    @DeleteMapping("/{id}")
    void delete(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) { service.delete(id, Me.of(jwt)); }

    @PostMapping("/{id}/teams")
    void addTeam(@PathVariable UUID id, @RequestBody TeamAdd r, @AuthenticationPrincipal Jwt jwt) { service.addTeam(id, r.teamId(), r.name(), Me.of(jwt)); }

    @DeleteMapping("/{id}/teams/{teamId}")
    void removeTeam(@PathVariable UUID id, @PathVariable UUID teamId, @AuthenticationPrincipal Jwt jwt) { service.removeTeam(id, teamId, Me.of(jwt)); }

    @PutMapping("/{id}/teams/{teamId}")
    void setGroup(@PathVariable UUID id, @PathVariable UUID teamId, @RequestBody Map<String, String> body, @AuthenticationPrincipal Jwt jwt) {
        service.setGroup(id, teamId, body.get("groupName"), Me.of(jwt));
    }

    @PostMapping("/{id}/draw")
    void draw(@PathVariable UUID id, @RequestBody Map<String, Integer> body, @AuthenticationPrincipal Jwt jwt) {
        service.draw(id, body.getOrDefault("groups", 2), Me.of(jwt));
    }

    @PostMapping("/{id}/fixtures")
    void fixtures(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) { service.generateFixtures(id, Me.of(jwt)); }

    @PostMapping("/{id}/adjustments")
    void adjust(@PathVariable UUID id, @RequestBody AdjustReq r, @AuthenticationPrincipal Jwt jwt) {
        service.adjust(id, r.teamId(), r.pointsDelta(), r.reason(), Me.of(jwt));
    }

    @GetMapping("/{id}/leaderboards")
    List<StatsService.Board> leaderboards(@PathVariable UUID id) {
        service.get(id);
        return stats.leaderboards(matches.findByTournamentIdOrderBySortOrder(id));
    }
}
