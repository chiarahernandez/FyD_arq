package com.uchfyd.pool;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.concurrent.*;

@RestController
public class PoolController {

    @Autowired
    private ExecutorService dynamicThreadPool;

    @PostMapping("/pool/ejecutar")
    public ResponseEntity<?> ejecutar(@RequestBody TareaRequest req) {
        try {
            Future<?> tarea = dynamicThreadPool.submit(() -> {
                // acá iría el trabajo real si lo hubiera; en este caso
                // la tarea "pesada" sigue siendo orquestada por Pedidos,
                // el pool solo demuestra la aceptación/rechazo de la tarea
            });
            tarea.get(5, TimeUnit.SECONDS); // timeout corto: no bloquear el camino crítico
            return ResponseEntity.ok().body(new TareaResponse("aceptada"));
        } catch (RejectedExecutionException e) {
            return ResponseEntity.status(503).body(new TareaResponse("capacidad excedida"));
        } catch (TimeoutException | InterruptedException | ExecutionException e) {
            return ResponseEntity.status(500).body(new TareaResponse("error"));
        }
    }

    record TareaRequest(String tareaId) {}
    record TareaResponse(String estado) {}
}
