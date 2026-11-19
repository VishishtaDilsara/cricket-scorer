package com.wicketly.web;

import com.wicketly.repo.MatchRepo;
import com.wicketly.service.*;
import com.wicketly.service.MatchService.MatchReq;
import com.wicketly.service.ScoringService.*;
import com.wicketly.service.Views.MatchSummary;
import com.wicketly.service.Views.MatchView;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/api/matches")
public class MatchController {
    private static final String DEVICE = "X-Device-Id";
    private final MatchService matchService;
    private final ScoringService scoring;
    private final MatchRepo matches;
    private final LiveHub live;

    public MatchController(MatchService matchService, ScoringService scoring, MatchRepo matches, LiveHub live) {
        this.matchService = matchService; this.scoring = scoring; this.matches = matches; this.live = live;
    }

    /** Matches in the signed-in admin's space; empty for visitors who are not signed in. */
    @GetMapping
    List<MatchSummary> list(@RequestParam(defaultValue = "recent") String filter, @AuthenticationPrincipal Jwt jwt) {
        UUID org = Me.orgOf(Me.of(jwt));
        if (org == null) return List.of();
        PageRequest page = PageRequest.of(0, 50);
        return matchService.summaries(switch (filter) {
            case "live" -> matches.listByStates(org, List.of("LIVE", "INNINGS_BREAK"), page);
            case "upcoming" -> matches.upcoming(org, "SCHEDULED", page);
            default -> matches.listByStates(org, List.of("COMPLETED", "ABANDONED"), page);
        });
    }

    @PostMapping
    Map<String, UUID> create(@RequestBody MatchReq r, @AuthenticationPrincipal Jwt jwt) {
        return Map.of("id", matchService.create(r, Me.of(jwt)).id);
    }

    @GetMapping("/{id}")
    MatchView view(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        return matchService.view(id, Me.of(jwt), false);
    }

    /** Same as the public view plus the raw ball records the scorer screen replays locally. */
    @GetMapping("/{id}/scoring")
    MatchView scoringView(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        return matchService.view(id, Me.of(jwt), true);
    }

    @GetMapping(value = "/{id}/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    SseEmitter stream(@PathVariable UUID id) {
        return live.subscribe(id);
    }

    @PutMapping("/{id}")
    void update(@PathVariable UUID id, @RequestBody MatchReq r, @AuthenticationPrincipal Jwt jwt) {
        matchService.update(id, r, Me.of(jwt));
    }

    @DeleteMapping("/{id}")
    void delete(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        matchService.delete(id, Me.of(jwt));
    }

    // ---------- scoring ----------

    @PostMapping("/{id}/claim")
    Map<String, Boolean> claim(@PathVariable UUID id, @RequestParam(defaultValue = "false") boolean force,
                               @RequestHeader(DEVICE) String device, @AuthenticationPrincipal Jwt jwt) {
        return Map.of("mine", scoring.claim(id, Me.of(jwt), device, force));
    }

    @PostMapping("/{id}/start")
    void start(@PathVariable UUID id, @RequestBody StartReq r, @RequestHeader(value = DEVICE, required = false) String device, @AuthenticationPrincipal Jwt jwt) {
        scoring.start(id, r, Me.of(jwt), device);
    }

    @PostMapping("/{id}/innings/{no}/start")
    void startInnings(@PathVariable UUID id, @PathVariable int no, @RequestHeader(value = DEVICE, required = false) String device, @AuthenticationPrincipal Jwt jwt) {
        scoring.startInnings(id, no, Me.of(jwt), device);
    }

    @PutMapping("/{id}/innings/{no}/players")
    void players(@PathVariable UUID id, @PathVariable int no, @RequestBody PlayersReq r, @RequestHeader(value = DEVICE, required = false) String device, @AuthenticationPrincipal Jwt jwt) {
        scoring.setPlayers(id, no, r, Me.of(jwt), device);
    }

    @PostMapping("/{id}/innings/{no}/balls")
    void ball(@PathVariable UUID id, @PathVariable int no, @RequestBody BallReq r, @RequestHeader(value = DEVICE, required = false) String device, @AuthenticationPrincipal Jwt jwt) {
        scoring.addBall(id, no, r, Me.of(jwt), device);
    }

    @PutMapping("/{id}/innings/{no}/balls/{ballId}")
    void editBall(@PathVariable UUID id, @PathVariable int no, @PathVariable UUID ballId, @RequestBody BallReq r, @RequestHeader(value = DEVICE, required = false) String device, @AuthenticationPrincipal Jwt jwt) {
        scoring.editBall(id, no, ballId, r, Me.of(jwt), device);
    }

    @DeleteMapping("/{id}/innings/{no}/balls/{ballId}")
    void undo(@PathVariable UUID id, @PathVariable int no, @PathVariable UUID ballId, @RequestHeader(value = DEVICE, required = false) String device, @AuthenticationPrincipal Jwt jwt) {
        scoring.undo(id, no, ballId, Me.of(jwt), device);
    }

    @PostMapping("/{id}/innings/{no}/end")
    void end(@PathVariable UUID id, @PathVariable int no, @RequestHeader(value = DEVICE, required = false) String device, @AuthenticationPrincipal Jwt jwt) {
        scoring.endInnings(id, no, Me.of(jwt), device);
    }

    @PutMapping("/{id}/innings/{no}/revise")
    void revise(@PathVariable UUID id, @PathVariable int no, @RequestBody ReviseReq r, @RequestHeader(value = DEVICE, required = false) String device, @AuthenticationPrincipal Jwt jwt) {
        scoring.revise(id, no, r, Me.of(jwt), device);
    }

    @PostMapping("/{id}/result")
    void result(@PathVariable UUID id, @RequestBody ResultReq r, @AuthenticationPrincipal Jwt jwt) {
        scoring.setResult(id, r, Me.of(jwt));
    }

    public record PlayerOfMatchReq(UUID playerId) {}

    @PutMapping("/{id}/player-of-match")
    void playerOfMatch(@PathVariable UUID id, @RequestBody PlayerOfMatchReq r, @AuthenticationPrincipal Jwt jwt) {
        matchService.setPlayerOfMatch(id, r.playerId(), Me.of(jwt));
    }
}
