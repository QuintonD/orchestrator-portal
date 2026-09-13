// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
package io.github.quintond.orchestrator.phonecontrol;

import org.json.JSONObject;
import java.io.IOException;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

final class LoopbackServer implements AutoCloseable {
    private final PhoneService service;
    private final ServerSocket server;
    private final ThreadPoolExecutor workers = new ThreadPoolExecutor(3, 3, 0, TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(4));
    private final java.util.concurrent.ScheduledExecutorService deadlines = java.util.concurrent.Executors.newSingleThreadScheduledExecutor();
    private volatile boolean closed;

    LoopbackServer(PhoneService service) throws IOException {
        this.service = service;
        server = new ServerSocket(Policy.PORT, 4, InetAddress.getByName("127.0.0.1"));
        Thread listener = new Thread(this::listen, "phone-loopback");
        listener.setDaemon(true);
        listener.start();
    }
    private void listen() {
        while (!closed) {
            try {
                Socket socket = server.accept();
                socket.setSoTimeout(5000);
                try { workers.execute(() -> serve(socket)); }
                catch (java.util.concurrent.RejectedExecutionException full) { socket.close(); }
            } catch (IOException failure) { if (!closed) service.stopSession("Listener unavailable"); }
        }
    }
    private void serve(Socket socket) {
        try (socket) {
            java.util.concurrent.ScheduledFuture<?> readDeadline = deadlines.schedule(() -> closeSocket(socket), 5, TimeUnit.SECONDS);
            JSONObject response;
            int status = 200;
            try {
                HttpRequest request = HttpRequest.read(socket.getInputStream());
                readDeadline.cancel(false);
                String supplied = request.authorization.startsWith("Bearer ") ? request.authorization.substring(7) : "";
                long generation = service.authenticate(supplied);
                response = service.call(request.body, generation);
            } catch (ApiException denied) {
                status = denied.code.equals("unauthorized") ? 401 : 403;
                response = Json.object("id", JSONObject.NULL, "error", Json.object("code", denied.code, "message", denied.getMessage()));
            } catch (IOException invalid) {
                status = 400;
                response = Json.object("id", JSONObject.NULL, "error", Json.object("code", "invalid_request", "message", "Invalid bounded HTTP request"));
            } catch (Exception failure) {
                status = 500;
                response = Json.object("id", JSONObject.NULL, "error", Json.object("code", "internal_error", "message", "Request failed closed"));
            }
            readDeadline.cancel(false);
            java.util.concurrent.ScheduledFuture<?> writeDeadline = deadlines.schedule(() -> closeSocket(socket), 5, TimeUnit.SECONDS);
            byte[] body = response.toString().getBytes(StandardCharsets.UTF_8);
            if (body.length > 6_000_000) {
                status = 413;
                body = Json.object("id", JSONObject.NULL, "error", Json.object("code", "response_too_large", "message", "Observation exceeds response limit")).toString().getBytes(StandardCharsets.UTF_8);
            }
            String headers = "HTTP/1.1 " + status + " Result\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: " + body.length
                    + "\r\nConnection: close\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\n\r\n";
            socket.getOutputStream().write(headers.getBytes(StandardCharsets.US_ASCII));
            socket.getOutputStream().write(body);
            writeDeadline.cancel(false);
        } catch (IOException disconnected) { /* Receipts, not socket delivery, determine whether an action may have happened. */ }
    }
    private static void closeSocket(Socket socket) { try { socket.close(); } catch (IOException ignored) { /* Timeout is fail closed. */ } }
    @Override public void close() {
        closed = true;
        try { server.close(); } catch (IOException ignored) { /* Already closed. */ }
        workers.shutdown();
        Thread cleanup = new Thread(() -> {
            try { workers.awaitTermination(60, TimeUnit.SECONDS); }
            catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); }
            finally { deadlines.shutdownNow(); }
        }, "phone-loopback-cleanup");
        cleanup.setDaemon(true);
        cleanup.start();
    }
}
