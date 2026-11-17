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
    @Query("select m from Match m where m.listed = true and m.state in ?1 order by m.scheduledAt desc")
    List<Match> listByStates(Collection<String> states, Pageable page);
    @Query("select m from Match m where m.listed = true and m.state = ?1 order by m.scheduledAt asc")
    List<Match> upcoming(String state, Pageable page);
    @Query("select m from Match m where m.teamAId = ?1 or m.teamBId = ?1 order by m.scheduledAt desc")
    List<Match> findByTeam(UUID teamId);
    @Query("select m from Match m where m.createdBy = ?1 or m.id in (select s.matchId from MatchScorer s where s.userId = ?1) order by m.scheduledAt desc")
    List<Match> findMine(UUID userId, Pageable page);
    long countByState(String state);
}
