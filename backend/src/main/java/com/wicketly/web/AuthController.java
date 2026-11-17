package com.wicketly.web;

import com.wicketly.domain.User;
import com.wicketly.repo.MatchRepo;
import com.wicketly.repo.TeamRepo;
import com.wicketly.repo.UserRepo;
import com.wicketly.service.Api;
import com.wicketly.service.MatchService;
import com.wicketly.service.Me;
import com.wicketly.service.Views.MatchSummary;
import com.wicketly.service.Views.TeamRef;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api")
public class AuthController {
    public record RegisterReq(String email, String name, String password) {}
    public record LoginReq(String email, String password) {}
    public record UserView(UUID id, String email, String name, boolean admin) {}
    public record Session(String token, UserView user) {}

    private final UserRepo users;
    private final PasswordEncoder encoder;
    private final JwtEncoder jwt;
    private final MatchRepo matches;
    private final TeamRepo teams;
    private final MatchService matchService;

    public AuthController(UserRepo users, PasswordEncoder encoder, JwtEncoder jwt, MatchRepo matches, TeamRepo teams, MatchService matchService) {
        this.users = users; this.encoder = encoder; this.jwt = jwt; this.matches = matches; this.teams = teams; this.matchService = matchService;
    }

    @PostMapping("/auth/register")
    Session register(@RequestBody RegisterReq r) {
        String email = r.email() == null ? "" : r.email().trim().toLowerCase();
        if (!email.matches("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")) throw Api.bad("Enter a valid email address");
        if (r.name() == null || r.name().isBlank()) throw Api.bad("Enter your name");
        if (r.password() == null || r.password().length() < 8) throw Api.bad("Password must be at least 8 characters");
        if (users.findByEmailIgnoreCase(email).isPresent()) throw Api.conflict("An account with that email already exists");
        User u = new User();
        u.email = email;
        u.name = r.name().trim();
        u.passwordHash = encoder.encode(r.password());
        return session(users.save(u));
    }

    @PostMapping("/auth/login")
    Session login(@RequestBody LoginReq r) {
        User u = users.findByEmailIgnoreCase(r.email() == null ? "" : r.email().trim()).orElse(null);
        if (u == null || r.password() == null || !encoder.matches(r.password(), u.passwordHash))
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Wrong email or password");
        return session(u);
    }

    @GetMapping("/me")
    UserView me(@AuthenticationPrincipal Jwt token) {
        User u = users.findById(Me.of(token).id()).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Account not found"));
        return view(u);
    }

    @GetMapping("/me/matches")
    List<MatchSummary> myMatches(@AuthenticationPrincipal Jwt token) {
        return matchService.summaries(matches.findMine(Me.of(token).id(), PageRequest.of(0, 30)));
    }

    @GetMapping("/me/teams")
    List<TeamRef> myTeams(@AuthenticationPrincipal Jwt token) {
        return teams.findByOwnerIdOrderByName(Me.of(token).id()).stream().map(MatchService::ref).toList();
    }

    private Session session(User u) {
        Instant now = Instant.now();
        // Long-lived so a scorer is not signed out mid-match at a ground with no signal.
        JwtClaimsSet claims = JwtClaimsSet.builder().subject(u.id.toString()).claim("adm", u.admin)
                .issuedAt(now).expiresAt(now.plus(30, ChronoUnit.DAYS)).build();
        String token = jwt.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
        return new Session(token, view(u));
    }

    private static UserView view(User u) { return new UserView(u.id, u.email, u.name, u.admin); }
}
