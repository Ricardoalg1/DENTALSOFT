package lat.occlus;

import org.springframework.boot.SpringApplication;

public class TestOcclusBackendApplication {

	public static void main(String[] args) {
		SpringApplication.from(OcclusBackendApplication::main).with(TestcontainersConfiguration.class).run(args);
	}

}
