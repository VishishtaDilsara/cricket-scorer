package com.wicketly.repo;

import com.wicketly.domain.*;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface BallRepo extends JpaRepository<Ball, UUID> {
    List<Ball> findByInningsIdOrderBySeq(UUID inningsId);
    Optional<Ball> findTopByInningsIdOrderBySeqDesc(UUID inningsId);
    List<Ball> findByInningsIdInOrderBySeq(Collection<UUID> inningsIds);
    long countByInningsId(UUID inningsId);
    @Query("select distinct b.inningsId from Ball b where b.strikerId = ?1 or b.nonStrikerId = ?1 or b.bowlerId = ?1 or b.fielderId = ?1")
    List<UUID> inningsOfPlayer(UUID playerId);
}
