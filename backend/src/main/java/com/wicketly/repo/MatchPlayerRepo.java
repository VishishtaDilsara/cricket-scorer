package com.wicketly.repo;

import com.wicketly.domain.MatchPlayer;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MatchPlayerRepo extends JpaRepository<MatchPlayer, UUID> {
    List<MatchPlayer> findByMatchId(UUID matchId);
    List<MatchPlayer> findByMatchIdAndTeamId(UUID matchId, UUID teamId);
}
