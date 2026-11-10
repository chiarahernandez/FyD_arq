package com.uchfyd.pool;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.*;
import java.util.stream.Collectors;

public class AlternatingWorkerPool {

    private static final int TAREAS_POR_HILO = 3;

    private final BlockingQueue<Runnable> cola;
    private final ExecutorService hilosBase;
    private final ExecutorService poolInterno = Executors.newCachedThreadPool();
    private volatile boolean activo = true;

    public AlternatingWorkerPool(int corePoolSize, int maxPoolSize, int capacidadCola) {
        this.cola = new LinkedBlockingQueue<>(capacidadCola);
        this.hilosBase = Executors.newFixedThreadPool(maxPoolSize);
        for (int i = 0; i < corePoolSize; i++) {
            hilosBase.submit(this::loopDeHilo);
        }
    }

    // Cada hilo toma hasta TAREAS_POR_HILO tareas y las corre en paralelo antes de pedir más.
    private void loopDeHilo() {
        while (activo) {
            try {
                Runnable primera = cola.take();
                List<Runnable> lote = new ArrayList<>();
                lote.add(primera);
                cola.drainTo(lote, TAREAS_POR_HILO - 1);

                List<CompletableFuture<Void>> futuros = lote.stream()
                    .map(tarea -> CompletableFuture.runAsync(tarea, poolInterno))
                    .collect(Collectors.toList());

                CompletableFuture.allOf(futuros.toArray(new CompletableFuture[0])).join();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
    }

    public boolean submit(Runnable tarea) {
        return cola.offer(tarea);
    }

    public void shutdown() {
        activo = false;
        hilosBase.shutdownNow();
        poolInterno.shutdown();
    }
}
