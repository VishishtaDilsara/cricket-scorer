package com.wicketly.repo;

import com.wicketly.domain.*;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface TeamRepo extends JpaRepository<Team, UUID> {
    List<Team> findByOwnerIdOrderByName(UUID ownerId);
    List<Team> findTop20ByNameContainingIgnoreCaseOrderByName(String q);
    List<Team> findTop50ByOrderByCreatedAtDesc();
}
