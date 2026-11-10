package com.uchfyd.pool;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class ThreadPoolConfig {

    @Bean(destroyMethod = "shutdown")
    public AlternatingWorkerPool alternatingWorkerPool() {
        return new AlternatingWorkerPool(20, 200, 500);
    }
}
