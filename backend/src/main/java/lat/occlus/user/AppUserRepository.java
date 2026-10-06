package lat.occlus.user;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AppUserRepository extends JpaRepository<AppUser, UUID> {

    Optional<AppUser> findByEmail(String email);

    boolean existsByEmail(String email);

    List<AppUser> findByClinicIdOrderByFullName(UUID clinicId);

    Optional<AppUser> findByIdAndClinicId(UUID id, UUID clinicId);

    List<AppUser> findByClinicIdAndProfessionalTrueAndActiveTrueOrderByFullName(UUID clinicId);
}
