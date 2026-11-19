package com.wicketly.repo;

import com.wicketly.domain.*;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface UserRepo extends JpaRepository<User, UUID> {
    Optional<User> findByEmailIgnoreCase(String email);
    Optional<User> findByUsername(String username);
    List<User> findByOrgIdAndRoleOrderByName(UUID orgId, String role);
}
