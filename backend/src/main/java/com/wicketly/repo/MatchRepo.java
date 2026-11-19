package com.wicketly.repo;

import com.wicketly.domain.*;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface MatchRepo extends JpaRepository<Match, UUID> {
    List<Match> findByTournamentIdOrderBySortOrder(UUID tournamentId);
    @Query("select m from Match m where m.ownerId = ?1 and m.state in ?2 order by m.scheduledAt desc")
    List<Match> listByStates(UUID ownerId, Collection<String> states, Pageable page);
    @Query("select m from Match m where m.ownerId = ?1 and m.state = ?2 order by m.scheduledAt asc")
    List<Match> upcoming(UUID ownerId, String state, Pageable page);
    @Query("select m from Match m where m.teamAId = ?1 or m.teamBId = ?1 order by m.scheduledAt desc")
    List<Match> findByTeam(UUID teamId);
    long countByOwnerIdAndStateIn(UUID ownerId, Collection<String> states);
    @Query("select m from Match m where m.ownerId = ?1 order by m.scheduledAt desc")
    List<Match> findByOwner(UUID ownerId, Pageable page);
    @Query("select count(b) from Ball b, Innings i, Match m where b.inningsId = i.id and i.matchId = m.id and m.ownerId = ?1")
    long countBallsByOwner(UUID ownerId);
}
