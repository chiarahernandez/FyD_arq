package com.uchfyd.pool;

import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;
import java.net.http.*;
import java.net.URI;

@Component
public class ConsulRegistration implements CommandLineRunner {
    @Override
    public void run(String... args) throws Exception {
        String body = """
          {
            "Name": "pool",
            "Address": "pool",
            "Port": 3005,
            "Check": {
              "HTTP": "http://pool:3005/health",
              "Interval": "10s",
              "Timeout": "5s",
              "DeregisterCriticalServiceAfter": "30s"
            }
          }
        """;
        HttpClient client = HttpClient.newHttpClient();
        HttpRequest req = HttpRequest.newBuilder()
            .uri(URI.create("http://" + System.getenv("CONSUL_HOST") + ":8500/v1/agent/service/register"))
            .PUT(HttpRequest.BodyPublishers.ofString(body))
            .build();
        client.send(req, HttpResponse.BodyHandlers.ofString());
    }
}