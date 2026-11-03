```java
package com.uchfyd.pool;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import java.util.concurrent.*;

@Configuration
public class ThreadPoolConfig {

    @Bean
    public ExecutorService dynamicThreadPool() {
        return new ThreadPoolExecutor(
            20,                               // corePoolSize
            200,                              // maximumPoolSize (igual al límite del TP2)
            60L, TimeUnit.SECONDS,            // tiempo de vida de hilos ociosos
            new LinkedBlockingQueue<>(500),   // cola de espera
            new ThreadPoolExecutor.AbortPolicy() // rechaza si está saturado
        );
    }
}
