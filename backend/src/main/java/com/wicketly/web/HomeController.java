package com.wicketly.web;

import com.wicketly.domain.Match;
import com.wicketly.domain.Player;
import com.wicketly.domain.Team;
import com.wicketly.repo.*;
import com.wicketly.service.MatchService;
import com.wicketly.service.TournamentService;
import com.wicketly.service.TournamentService.TournamentCard;
import com.wicketly.service.TournamentService.TournamentView;
import com.wicketly.service.Views.MatchSummary;
import com.wicketly.service.Views.MatchView;
import com.wicketly.service.Views.TeamRef;
import java.util.*;
import org.springframework.data.domain.PageRequest;
import org.springframework.transaction.annotation.Transactional;
import com.wicketly.service.Me;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
@Transactional(readOnly = true)
public class HomeController {
    public record Counts(long live, long completed, long tournaments, long teams, long players, long balls) {}
    public record Overview(Counts counts, MatchView featured, List<MatchSummary> live, List<MatchSummary> upcoming,
                           List<MatchSummary> recent, TournamentView tournament) {}
    public record SearchResult(List<MatchSummary> matches, List<TeamRef> teams, List<Player> players, List<TournamentCard> tournaments) {}

    private final MatchRepo matches;
    private final TeamRepo teams;
    private final PlayerRepo players;
    private final TournamentRepo tournaments;
    private final MatchService matchService;
    private final TournamentService tournamentService;

    public HomeController(MatchRepo matches, TeamRepo teams, PlayerRepo players, TournamentRepo tournaments,
                          MatchService matchService, TournamentService tournamentService) {
        this.matches = matches; this.teams = teams; this.players = players; this.tournaments = tournaments;
        this.matchService = matchService; this.tournamentService = tournamentService;
    }

    /** The signed-in admin's space. Visitors who are not signed in get an empty overview. */
    @GetMapping("/overview")
    Overview overview(@AuthenticationPrincipal Jwt jwt) {
        Me me = Me.of(jwt);
        UUID org = Me.orgOf(me);
        if (org == null) return new Overview(new Counts(0, 0, 0, 0, 0, 0), null, List.of(), List.of(), List.of(), null);
        List<Match> live = matches.listByStates(org, List.of("LIVE", "INNINGS_BREAK"), PageRequest.of(0, 6));
        List<Match> recent = matches.listByStates(org, List.of("COMPLETED", "ABANDONED"), PageRequest.of(0, 6));
        Match feature = !live.isEmpty() ? live.get(0) : !recent.isEmpty() ? recent.get(0) : null;
        TournamentView tv = tournaments.findTop50ByOwnerIdOrderByCreatedAtDesc(org).stream().filter(t -> !t.status.equals("DRAFT")).findFirst()
                .map(t -> tournamentService.view(t.id, me)).orElse(null);
        Counts counts = new Counts(matches.countByOwnerIdAndStateIn(org, List.of("LIVE", "INNINGS_BREAK")),
                matches.countByOwnerIdAndStateIn(org, List.of("COMPLETED")), tournaments.countByOwnerId(org),
                teams.countByOwnerId(org), players.countByOwnerId(org), matches.countBallsByOwner(org));
        return new Overview(counts, feature == null ? null : matchService.view(feature.id, me, false), matchService.summaries(live),
                matchService.summaries(matches.upcoming(org, "SCHEDULED", PageRequest.of(0, 6))), matchService.summaries(recent), tv);
    }

    @GetMapping("/search")
    SearchResult search(@RequestParam String q, @AuthenticationPrincipal Jwt jwt) {
        String s = q.trim();
        UUID org = Me.orgOf(Me.of(jwt));
        if (s.length() < 2 || org == null) return new SearchResult(List.of(), List.of(), List.of(), List.of());
        List<Team> ts = teams.findTop20ByOwnerIdAndNameContainingIgnoreCaseOrderByName(org, s);
        Map<UUID, Match> found = new LinkedHashMap<>();
        for (Team t : ts) for (Match m : matches.findByTeam(t.id)) if (org.equals(m.ownerId) && found.size() < 20) found.put(m.id, m);
        return new SearchResult(matchService.summaries(new ArrayList<>(found.values())), ts.stream().map(MatchService::ref).toList(),
                players.findTop20ByOwnerIdAndNameContainingIgnoreCaseOrderByName(org, s), tournamentService.list(s, org));
    }
}
