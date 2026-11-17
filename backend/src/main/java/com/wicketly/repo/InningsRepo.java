package com.wicketly.repo;

import com.wicketly.domain.*;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface InningsRepo extends JpaRepository<Innings, UUID> {
    List<Innings> findByMatchIdOrderByInningsNo(UUID matchId);
    List<Innings> findByMatchIdInOrderByInningsNo(Collection<UUID> matchIds);
    Optional<Innings> findByMatchIdAndInningsNo(UUID matchId, int inningsNo);
}
