package com.wicketly.service;

import com.wicketly.domain.Match;
import com.wicketly.domain.Player;
import com.wicketly.domain.Team;
import com.wicketly.domain.Tournament;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * Role checks. Each admin has a separate space: only that admin creates, edits and deletes its teams, players,
 * tournaments and matches, and the scorers the admin created can score its matches. Viewing by link stays open.
 */
@Component
public class Access {
    /** Signed in and working in the space that owns this item. */
    public static boolean sameOrg(Me me, UUID ownerId) {
        return me != null && ownerId != null && ownerId.equals(me.org());
    }

    public static boolean isAdmin(Me me) { return me != null && me.admin(); }

    public void requireAdmin(Me me) {
        if (!isAdmin(me)) throw Api.forbidden();
    }

    public boolean canManage(Me me, Tournament t) { return isAdmin(me) && sameOrg(me, t.ownerId); }

    public boolean canManage(Me me, Match m) { return isAdmin(me) && sameOrg(me, m.ownerId); }

    /** The admin, or any scorer the admin created. */
    public boolean canScore(Me me, Match m) { return sameOrg(me, m.ownerId); }

    public boolean canEdit(Me me, Team t) { return isAdmin(me) && sameOrg(me, t.ownerId); }

    public boolean canEdit(Me me, Player p) { return isAdmin(me) && sameOrg(me, p.ownerId); }
}
