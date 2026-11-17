package com.wicketly.repo;

import com.wicketly.domain.*;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface TournamentTeamRepo extends JpaRepository<TournamentTeam, UUID> {
    List<TournamentTeam> findByTournamentId(UUID tournamentId);
    Optional<TournamentTeam> findByTournamentIdAndTeamId(UUID tournamentId, UUID teamId);
}
