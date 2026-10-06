package lat.occlus;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.test.context.DynamicPropertyRegistrar;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import org.testcontainers.utility.MountableFile;

/**
 * Postgres real para las pruebas, configurado igual que producción: Flyway migra con el rol dueño
 * y la app se conecta con el rol restringido occlus_app, así Row-Level Security sí se prueba.
 */
@TestConfiguration(proxyBeanMethods = false)
public class TestcontainersConfiguration {

	@Bean
	PostgreSQLContainer postgresContainer() {
		return new PostgreSQLContainer(DockerImageName.parse("postgres:17-alpine"))
				.withCopyFileToContainer(MountableFile.forHostPath("../docker/postgres/01-app-role.sql"),
						"/docker-entrypoint-initdb.d/01-app-role.sql");
	}

	@Bean
	DynamicPropertyRegistrar postgresProperties(PostgreSQLContainer postgres) {
		return registry -> {
			registry.add("spring.datasource.url", postgres::getJdbcUrl);
			registry.add("spring.datasource.username", () -> "occlus_app");
			registry.add("spring.datasource.password", () -> "occlus_app");
			registry.add("spring.flyway.url", postgres::getJdbcUrl);
			registry.add("spring.flyway.user", postgres::getUsername);
			registry.add("spring.flyway.password", postgres::getPassword);
		};
	}

}
