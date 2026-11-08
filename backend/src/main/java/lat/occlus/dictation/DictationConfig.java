package lat.occlus.dictation;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(DictationProperties.class)
class DictationConfig {}
