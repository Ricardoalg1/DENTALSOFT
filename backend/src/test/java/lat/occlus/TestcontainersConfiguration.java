package lat.occlus;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.test.context.DynamicPropertyRegistrar;
import org.testcontainers.containers.GenericContainer;
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

	/** S3 de pruebas (adobe/s3mock): acepta cualquier credencial. */
	@Bean
	GenericContainer<?> s3Container() {
		return new GenericContainer<>(DockerImageName.parse("adobe/s3mock:latest"))
				.withEnv("COM_ADOBE_TESTING_S3MOCK_STORE_INITIAL_BUCKETS", "occlus-test")
				.withExposedPorts(9090);
	}

	@Bean
	DynamicPropertyRegistrar postgresProperties(PostgreSQLContainer postgres, GenericContainer<?> s3Container) {
		return registry -> {
			registry.add("occlus.storage.endpoint",
					() -> "http://" + s3Container.getHost() + ":" + s3Container.getMappedPort(9090));
			registry.add("occlus.storage.bucket", () -> "occlus-test");
			// Administrador de plataforma de las pruebas (lo crea PlatformTestSupport con este mismo UUID).
			registry.add("occlus.marketing.admin-user-ids", () -> lat.occlus.support.PlatformTestSupport.PLATFORM_ADMIN_ID);
			registry.add("spring.datasource.url", postgres::getJdbcUrl);
			registry.add("spring.datasource.username", () -> "occlus_app");
			registry.add("spring.datasource.password", () -> "occlus_app");
			registry.add("spring.flyway.url", postgres::getJdbcUrl);
			registry.add("spring.flyway.user", postgres::getUsername);
			registry.add("spring.flyway.password", postgres::getPassword);
		};
	}

}
