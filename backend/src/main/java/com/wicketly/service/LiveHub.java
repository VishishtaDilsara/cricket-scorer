package com.wicketly.service;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/** Server-sent events: tells every open match page to refresh the moment a ball is committed. */
@Component
public class LiveHub {
    private final Map<UUID, List<SseEmitter>> subscribers = new ConcurrentHashMap<>();

    public SseEmitter subscribe(UUID matchId) {
        SseEmitter e = new SseEmitter(0L);
        List<SseEmitter> list = subscribers.computeIfAbsent(matchId, k -> new CopyOnWriteArrayList<>());
        list.add(e);
        Runnable drop = () -> list.remove(e);
        e.onCompletion(drop);
        e.onTimeout(drop);
        e.onError(t -> drop.run());
        send(matchId, e, "hello");
        return e;
    }

    /** Publishes after the surrounding transaction commits, so viewers never fetch uncommitted state. */
    public void publish(UUID matchId) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() { broadcast(matchId, "update"); }
            });
        } else {
            broadcast(matchId, "update");
        }
    }

    @Scheduled(fixedRate = 20000)
    void heartbeat() { subscribers.keySet().forEach(id -> broadcast(id, "ping")); }

    private void broadcast(UUID matchId, String event) {
        List<SseEmitter> list = subscribers.get(matchId);
        if (list != null) list.forEach(e -> send(matchId, e, event));
    }

    private void send(UUID matchId, SseEmitter e, String event) {
        try {
            e.send(SseEmitter.event().name(event).data("{}"));
        } catch (IOException | IllegalStateException ex) {
            List<SseEmitter> list = subscribers.get(matchId);
            if (list != null) list.remove(e);
        }
    }
}
