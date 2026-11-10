package com.uchfyd.pool;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
public class PoolController {

    @Autowired
    private AlternatingWorkerPool alternatingWorkerPool;

    @PostMapping("/pool/ejecutar")
    public ResponseEntity<?> ejecutar(@RequestBody TareaRequest req) {
        boolean aceptada = alternatingWorkerPool.submit(() -> {});
        if (!aceptada) {
            return ResponseEntity.status(503).body(new TareaResponse("capacidad excedida"));
        }
        return ResponseEntity.ok().body(new TareaResponse("aceptada"));
    }

    @GetMapping("/health")
    public ResponseEntity<Void> health() {
        return ResponseEntity.ok().build();
    }

    record TareaRequest(String tareaId) {}
    record TareaResponse(String estado) {}
}
