package com.wicketly.repo;

import com.wicketly.domain.*;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface PlayerRepo extends JpaRepository<Player, UUID> {
    List<Player> findTop20ByNameContainingIgnoreCaseOrderByName(String q);
    @Query("select p from Player p, TeamPlayer tp where tp.playerId = p.id and tp.teamId = ?1 order by p.createdAt, p.name")
    List<Player> findByTeam(UUID teamId);
}
