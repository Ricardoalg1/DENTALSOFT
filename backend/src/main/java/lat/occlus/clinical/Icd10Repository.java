package lat.occlus.clinical;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

public interface Icd10Repository extends JpaRepository<Icd10, String>, JpaSpecificationExecutor<Icd10> {}
