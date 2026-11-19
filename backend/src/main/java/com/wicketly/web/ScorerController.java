package com.wicketly.web;

import com.wicketly.domain.User;
import com.wicketly.repo.MatchScorerRepo;
import com.wicketly.repo.UserRepo;
import com.wicketly.service.Access;
import com.wicketly.service.Api;
import com.wicketly.service.Me;
import com.wicketly.web.AuthController.UserView;
import java.util.List;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

/** An admin creates, lists and removes the scorer accounts that work in the admin's space. */
@RestController
@RequestMapping("/api/scorers")
@Transactional
public class ScorerController {
    public record ScorerReq(String email, String username, String password) {}
    public record PasswordReq(String password) {}

    private final UserRepo users;
    private final MatchScorerRepo matchScorers;
    private final PasswordEncoder encoder;
    private final Access access;

    public ScorerController(UserRepo users, MatchScorerRepo matchScorers, PasswordEncoder encoder, Access access) {
        this.users = users; this.matchScorers = matchScorers; this.encoder = encoder; this.access = access;
    }

    @GetMapping
    List<UserView> list(@AuthenticationPrincipal Jwt jwt) {
        Me me = admin(jwt);
        return users.findByOrgIdAndRoleOrderByName(me.org(), Me.SCORER).stream().map(AuthController::view).toList();
    }

    @PostMapping
    UserView create(@RequestBody ScorerReq r, @AuthenticationPrincipal Jwt jwt) {
        Me me = admin(jwt);
        String email = AuthController.validEmail(r.email());
        String username = r.username() == null ? "" : r.username().trim().toLowerCase();
        if (!username.matches("^[a-z0-9._-]{3,30}$"))
            throw Api.bad("Username must be 3 to 30 characters: letters, numbers, dots, dashes or underscores");
        AuthController.validPassword(r.password());
        if (users.findByEmailIgnoreCase(email).isPresent()) throw Api.conflict("An account with that email already exists");
        if (users.findByUsername(username).isPresent()) throw Api.conflict("That username is taken");
        User u = new User();
        u.email = email;
        u.username = username;
        u.name = username;
        u.passwordHash = encoder.encode(r.password());
        u.role = Me.SCORER;
        u.orgId = me.org();
        return AuthController.view(users.save(u));
    }

    @PutMapping("/{id}/password")
    void resetPassword(@PathVariable UUID id, @RequestBody PasswordReq r, @AuthenticationPrincipal Jwt jwt) {
        User u = ownScorer(id, admin(jwt));
        AuthController.validPassword(r.password());
        u.passwordHash = encoder.encode(r.password());
    }

    /** Deleting signs the scorer out everywhere: tokens of deleted accounts are rejected. */
    @DeleteMapping("/{id}")
    void delete(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        User u = ownScorer(id, admin(jwt));
        matchScorers.deleteByUserId(u.id);
        users.delete(u);
    }

    private Me admin(Jwt jwt) {
        Me me = Me.of(jwt);
        access.requireAdmin(me);
        return me;
    }

    private User ownScorer(UUID id, Me me) {
        return users.findById(id).filter(u -> Me.SCORER.equals(u.role) && me.org().equals(u.orgId))
                .orElseThrow(() -> Api.notFound("Scorer"));
    }
}
