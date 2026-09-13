// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
package io.github.quintond.orchestrator.phonecontrol;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Bitmap;
import android.graphics.Path;
import android.hardware.biometrics.BiometricManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Base64;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.security.SecureRandom;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.FutureTask;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

public final class PhoneService extends AccessibilityService {
    static volatile PhoneService instance;
    final Handler main = new Handler(Looper.getMainLooper());
    LocalPolicy policy;
    private MutationLedger ledger;
    private LoopbackServer server;
    private volatile String token;
    private volatile long expiryElapsed;
    private volatile long expiresAt;
    private volatile long generation;
    private volatile String status = "Session stopped";
    private volatile Observation latest;
    private volatile long lastCaptureElapsed;
    private final CaptureCoordinator captures = new CaptureCoordinator();
    private final java.util.concurrent.ExecutorService screenshotEncoder = java.util.concurrent.Executors.newSingleThreadExecutor(task -> {
        Thread thread = new Thread(task, "phone-screenshot-encoder"); thread.setDaemon(true); return thread;
    });
    private final AtomicBoolean busy = new AtomicBoolean();
    private final Map<String, Long> contentEpochs = new HashMap<>();
    volatile ConsentActivity.Pending consent;
    private final BroadcastReceiver screenOff = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) { stopSession("Device screen turned off"); }
    };

    @Override protected void onServiceConnected() {
        policy = new LocalPolicy(this);
        ledger = new MutationLedger(this);
        instance = this;
        registerReceiver(screenOff, new IntentFilter(Intent.ACTION_SCREEN_OFF), Context.RECEIVER_NOT_EXPORTED);
        getSystemService(NotificationManager.class).createNotificationChannel(new NotificationChannel("phone-session", "Phone control session", NotificationManager.IMPORTANCE_LOW));
    }
    @Override public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event.getPackageName() == null) return;
        int type = event.getEventType();
        if (type == AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED || type == AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED || type == AccessibilityEvent.TYPE_VIEW_SCROLLED) {
            String name = event.getPackageName().toString();
            if (policy != null && policy.apps().contains(name)) contentEpochs.put(name, contentEpoch(name) + 1);
        }
    }
    long contentEpoch(String name) { return contentEpochs.getOrDefault(name, 0L); }
    @Override public void onInterrupt() { stopSession("Accessibility interrupted"); }
    @Override public boolean onUnbind(Intent intent) { stopSession("Accessibility disconnected"); return super.onUnbind(intent); }
    @Override public void onDestroy() {
        stopSession("Accessibility disabled");
        screenshotEncoder.shutdown();
        instance = null;
        try { unregisterReceiver(screenOff); } catch (IllegalArgumentException ignored) { /* Service never connected. */ }
        super.onDestroy();
    }

    synchronized void startSession() throws ApiException {
        stopSession("New session");
        if (busy.get()) throw new ApiException("busy", "Wait for the previous action to settle");
        if (!getSystemService(NotificationManager.class).areNotificationsEnabled()) throw new ApiException("notification_required", "Allow notifications before starting a visible session");
        if (policy.apps().isEmpty() || policy.operations().isEmpty()) throw new ApiException("empty_policy", "Select at least one app and operation");
        for (String app : policy.apps()) policy.requireApp(app);
        ledger.reset();
        byte[] secret = new byte[32];
        new SecureRandom().nextBytes(secret);
        token = Base64.encodeToString(secret, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
        expiryElapsed = SystemClock.elapsedRealtime() + Policy.SESSION_MS;
        expiresAt = System.currentTimeMillis() + Policy.SESSION_MS;
        generation++;
        try { server = new LoopbackServer(this); }
        catch (java.io.IOException unavailable) { token = null; throw new ApiException("port_unavailable", "Loopback port 8837 is unavailable"); }
        status = "Active: local host may observe allowed apps";
        showNotification();
        long startedGeneration = generation;
        main.postDelayed(() -> { if (generation == startedGeneration) stopSession("Session expired"); }, Policy.SESSION_MS);
    }
    synchronized void stopSession(String reason) {
        token = null;
        generation++;
        expiryElapsed = 0;
        latest = null;
        status = reason;
        ConsentActivity.Pending pending = consent;
        if (pending != null) pending.cancel();
        CaptureCoordinator.Ticket capture = captures.current();
        if (capture != null) {
            captures.abandon(capture);
            capture.result.completeExceptionally(new ApiException("session_expired", "Phone session ended during capture"));
        }
        if (server != null) { server.close(); server = null; }
        getSystemService(NotificationManager.class).cancel(8837);
    }
    String status() { return status; }
    String pairingToken() { return token; }
    long expiresAt() { return expiresAt; }
    synchronized long authenticate(String supplied) throws ApiException {
        if (!Policy.tokenEquals(token, supplied)) throw new ApiException("unauthorized", "Invalid session token");
        requireSession();
        return generation;
    }
    void requireSession() throws ApiException {
        if (token == null || SystemClock.elapsedRealtime() >= expiryElapsed) throw new ApiException("session_expired", "No active phone session");
    }
    void requireGeneration(long value) throws ApiException {
        requireSession();
        if (generation != value) throw new ApiException("session_expired", "Phone session changed");
    }
    private void showNotification() {
        Intent intent = new Intent(this, MainActivity.class).putExtra("stop", true);
        PendingIntent stop = PendingIntent.getActivity(this, 1, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification notification = new Notification.Builder(this, "phone-session")
                .setSmallIcon(android.R.drawable.ic_menu_view).setContentTitle("Phone control is active")
                .setContentText("Allowed apps may be shared. Tap to stop immediately.")
                .setContentIntent(stop).setOngoing(true).setVisibility(Notification.VISIBILITY_PRIVATE)
                .addAction(new Notification.Action.Builder(null, "Stop session", stop).build()).build();
        getSystemService(NotificationManager.class).notify(8837, notification);
    }

    JSONObject call(String body, long sessionGeneration) {
        String id = null;
        boolean mutation = false;
        boolean locked = false;
        boolean reserved = false;
        String hash = null;
        JSONObject completedReadRecovery = null;
        JSONObject response;
        try {
            requireGeneration(sessionGeneration);
            JSONObject request = new JSONObject(body);
            Json.only(request, "id", "method", "params");
            id = Json.string(request, "id", 96);
            if (!Policy.validId(id)) throw new ApiException("invalid_request", "Invalid request id");
            String method = Json.string(request, "method", 48);
            if (!(request.opt("params") instanceof JSONObject params)) throw new ApiException("invalid_request", "params must be an object");
            if (method.equals("stop")) {
                Json.only(params);
                stopSession("Stopped by paired host");
                return Json.object("id", id, "result", Json.object("status", "stopped", "inFlightGestureMayFinish", busy.get()));
            }
            if (method.equals("describe")) {
                Json.only(params);
                return Json.object("id", id, "result", describe());
            }
            if (!Policy.OPERATIONS.contains(method)) throw new ApiException("unsupported_method", "Unsupported method");
            policy.requireOperation(method);
            mutation = Policy.MUTATIONS.contains(method);
            if (!busy.compareAndSet(false, true)) throw new ApiException("busy", "An observation or action is in progress");
            locked = true;
            if (mutation) {
                hash = Policy.digest(Json.canonical(request));
                JSONObject previous = ledger.previous(id, hash);
                if (previous != null) return previous;
                ledger.begin(id, hash);
                reserved = true;
            }
            JSONObject result = switch (method) {
                case "apps.list" -> listApps(params);
                case "observe" -> observe(params, sessionGeneration);
                default -> mutate(method, params, sessionGeneration);
            };
            if (method.equals("observe")) completedReadRecovery = result.optJSONObject("captureRecovery");
            if (mutation && (token == null || generation != sessionGeneration || SystemClock.elapsedRealtime() >= expiryElapsed))
                throw new ApiException("unknown_action_state", "Session ended after action dispatch; observe before deciding what happened");
            requireGeneration(sessionGeneration);
            response = Json.object("id", id, "result", result);
        } catch (ApiException denied) {
            JSONObject error = Json.object("code", denied.code, "message", denied.getMessage());
            JSONObject details = recoveryDetails(denied.details, completedReadRecovery);
            if (details != null) try { error.put("details", details); } catch (JSONException impossible) { throw new AssertionError(impossible); }
            response = Json.object("id", id == null ? JSONObject.NULL : id, "error", error);
        } catch (JSONException invalid) {
            JSONObject error = Json.object("code", "invalid_request", "message", "Invalid JSON request");
            if (completedReadRecovery != null) try { error.put("details", recoveryDetails(null, completedReadRecovery)); } catch (JSONException impossible) { throw new AssertionError(impossible); }
            response = Json.object("id", id == null ? JSONObject.NULL : id, "error", error);
        } catch (Exception failure) {
            JSONObject error = Json.object("code", mutation ? "unknown_action_state" : "internal_error", "message", "Request could not be reconciled; do not replay an action");
            if (completedReadRecovery != null) try { error.put("details", recoveryDetails(null, completedReadRecovery)); } catch (JSONException impossible) { throw new AssertionError(impossible); }
            response = Json.object("id", id == null ? JSONObject.NULL : id, "error", error);
        } finally {
            if (locked) busy.set(false);
        }
        if (reserved) {
            try { synchronized (this) { if (generation == sessionGeneration) ledger.save(id, hash, response); } }
            catch (ApiException unavailable) { return Json.object("id", id, "error", Json.object("code", "unknown_action_state", "message", "Action receipt could not be saved; do not replay")); }
        }
        return response;
    }

    private JSONObject describe() {
        Set<String> methods = policy.operations();
        methods.add("describe"); methods.add("stop");
        return Json.object("protocolVersion", 1, "platform", "android", "appVersion", "0.1.0-alpha.2", "methods", new JSONArray(methods),
                "session", Json.object("expiresAt", expiresAt), "transport", "adb-loopback",
                "capabilities", Json.object("windowScreenshot", true, "tree", true, "perActionConsent", "strong_biometric", "strongBiometricAvailable", biometricAvailable(), "fixtureAutomation", policy.operations().contains("fixture.increment")),
                "limits", Json.object("sessionMs", Policy.SESSION_MS, "observationMs", Policy.OBSERVATION_MS, "maxNodes", Policy.MAX_NODES));
    }
    boolean biometricAvailable() { return getSystemService(BiometricManager.class).canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG) == BiometricManager.BIOMETRIC_SUCCESS; }
    private Set<String> scope(JSONObject params) throws ApiException {
        if (!(params.opt("allowedPackages") instanceof JSONArray names) || names.length() < 1 || names.length() > 32)
            throw new ApiException("invalid_request", "A bounded nonempty allowedPackages scope is required");
        Set<String> scope = new HashSet<>();
        for (int i = 0; i < names.length(); i++) {
            Object name = names.opt(i);
            if (!(name instanceof String text) || !Policy.validPackage(text)) throw new ApiException("invalid_request", "Invalid allowed package");
            if (policy.apps().contains(text)) { policy.requireApp(text); scope.add(text); }
        }
        if (scope.isEmpty()) throw new ApiException("forbidden", "No apps are allowed by both phone and caller scope");
        return scope;
    }
    private JSONObject listApps(JSONObject params) throws ApiException {
        Json.only(params, "allowedPackages");
        JSONArray apps = new JSONArray();
        for (String name : scope(params)) apps.put(Json.object("packageName", name, "label", name));
        return Json.object("apps", apps);
    }
    private JSONObject observe(JSONObject params, long currentGeneration) throws Exception {
        ObservationRecovery recovery = new ObservationRecovery(android.os.Build.VERSION.SDK_INT, SystemClock::elapsedRealtime);
        Json.only(params, "includeScreenshot", "allowedPackages");
        if (params.has("includeScreenshot") && !(params.opt("includeScreenshot") instanceof Boolean)) throw new ApiException("invalid_request", "includeScreenshot must be boolean");
        if (params.optBoolean("includeScreenshot", false) && !policy.screenshots()) throw new ApiException("forbidden", "Screenshots are not enabled on the phone");
        Set<String> packages = scope(params);
        latest = null;
        boolean includePixels = params.optBoolean("includeScreenshot", false);
        Observation[] captureTarget = new Observation[1];
        try {
            ObservationRecovery.Result<Observation, byte[]> captured = recovery.run(new ObservationRecovery.Work<Observation, byte[]>() {
                @Override public Observation read(ObservationRecovery.Deadline deadline) throws Exception {
                    requireGeneration(currentGeneration);
                    policy.requireOperation("observe");
                    return observeOnMain(() -> {
                        requireGeneration(currentGeneration);
                        return Observation.capture(PhoneService.this, packages);
                    }, deadline);
                }
                @Override public byte[] capture(Observation before, ObservationRecovery.Deadline deadline) throws Exception {
                    requireGeneration(currentGeneration);
                    policy.requireOperation("observe");
                    policy.requireApp(before.packageName);
                    if (includePixels && !policy.screenshots()) throw new ApiException("forbidden", "Screenshot permission was removed");
                    captureTarget[0] = before;
                    return captureWindow(before, currentGeneration, includePixels, deadline);
                }
                @Override public void sameTarget(Observation first, Observation next) throws ApiException {
                    if (!first.packageName.equals(next.packageName) || first.windowId != next.windowId || !first.identity.equals(next.identity))
                        throw new ApiException("stale_observation", "Target changed before observation recovery");
                }
                @Override public void verify(Observation before, Observation after) throws ApiException {
                    if (!before.same(after)) throw new ApiException("stale_observation", "Window changed during capture",
                            Json.object("stateDifference", before.difference(after).replace(' ', '_')));
                }
            });
            JSONObject result = captured.observation().response();
            if (includePixels) {
                if (!policy.screenshots()) throw new ApiException("forbidden", "Screenshot permission was removed");
                result.put("screenshot", Json.object("mimeType", "image/png", "base64", Base64.encodeToString(captured.pixels(), Base64.NO_WRAP)));
            }
            synchronized (this) {
                requireGeneration(currentGeneration);
                recovery.deadline.check();
                JSONObject facts = captureRecovery(recovery);
                if (facts != null) result.put("captureRecovery", facts);
                // Publication and Stop share the same lock. A delayed read cannot
                // restore latest after Stop has cleared it, or after its budget.
                recovery.deadline.check();
                latest = captured.observation();
            }
            return result;
        } catch (Exception failed) {
            ApiException failure = failed instanceof ApiException api ? api
                    : failed instanceof ObservationRecovery.DeadlineExceeded
                        ? CaptureDiagnostics.failure("screenshot_timeout")
                        : new ApiException("internal_error", "Observation failed; tree and pixels withheld");
            JSONObject facts = captureRecovery(recovery);
            if (facts != null) {
                failure = new ApiException(failure.code, failure.getMessage(), recoveryDetails(failure.details, facts));
            }
            // Preserve the existing blocked-observation protocol, with no tree or
            // pixels, while carrying recovery facts through both response forms.
            Observation before = captureTarget[0];
            if (before != null && CaptureDiagnostics.known(failure.code)) {
                JSONObject blocked = Json.object("observationId", before.id, "packageName", before.packageName, "windowId", before.windowId,
                        "width", before.bounds.width(), "height", before.bounds.height(), "capturedAt", before.capturedAt,
                        "nodes", new JSONArray(), "blockedReason", failure.code);
                if (failure.details != null) {
                    for (String key : new String[] { "captureStage", "captureElapsedMs", "captureRecovery" })
                        if (failure.details.has(key)) blocked.put(key, failure.details.get(key));
                }
                return blocked;
            }
            throw failure;
        }
    }

    private static JSONObject captureRecovery(ObservationRecovery recovery) {
        ObservationRecovery.Facts facts = recovery.facts();
        return facts == null ? null : Json.object("retryCount", 1, "initialError", "screenshot_internal_error",
                "initialStage", "awaiting_callback", "initialElapsedMs", facts.initialElapsedMs(), "totalElapsedMs", facts.totalElapsedMs());
    }

    private static JSONObject recoveryDetails(JSONObject existing, JSONObject recovery) {
        if (recovery == null) return existing;
        JSONObject details = new JSONObject();
        try {
            if (existing != null) for (java.util.Iterator<String> keys = existing.keys(); keys.hasNext();) {
                String key = keys.next(); details.put(key, existing.get(key));
            }
            details.put("captureRecovery", recovery);
        } catch (JSONException impossible) { throw new AssertionError(impossible); }
        return details;
    }

    private <T> T observeOnMain(Callable<T> task, ObservationRecovery.Deadline deadline) throws Exception {
        if (!deadline.bounded) return onMain(task);
        FutureTask<T> future = new FutureTask<>(() -> { deadline.check(); return task.call(); });
        long wait = deadline.remaining(5000);
        main.post(future);
        try {
            T value = future.get(wait, TimeUnit.MILLISECONDS);
            deadline.check();
            return value;
        } catch (java.util.concurrent.ExecutionException failed) {
            if (failed.getCause() instanceof Exception cause) throw cause;
            throw failed;
        } catch (java.util.concurrent.TimeoutException timeout) {
            future.cancel(false);
            throw new ObservationRecovery.DeadlineExceeded();
        } catch (InterruptedException interrupted) {
            future.cancel(false);
            Thread.currentThread().interrupt();
            throw interrupted;
        }
    }

    private byte[] captureWindow(Observation before, long currentGeneration, boolean includePixels) throws Exception {
        return captureWindow(before, currentGeneration, includePixels, null);
    }
    private byte[] captureWindow(Observation before, long currentGeneration, boolean includePixels, ObservationRecovery.Deadline deadline) throws Exception {
        if (deadline != null) deadline.check();
        if (!Policy.capturePixels(before.windowBounds.width(), before.windowBounds.height())) throw CaptureDiagnostics.failure("screenshot_too_large");
        // Android enforces a 333 ms screenshot request interval. Pace the read-only probe here so
        // fast MCP clients can observe then act immediately without undocumented client sleeps.
        long delay = Policy.SCREENSHOT_INTERVAL_MS - (SystemClock.elapsedRealtime() - lastCaptureElapsed);
        if (delay > 0) Thread.sleep(deadline == null ? delay : deadline.remaining(delay));
        if (deadline != null) deadline.check();
        requireGeneration(currentGeneration);
        CaptureCoordinator.Ticket ticket = captures.begin(SystemClock.elapsedRealtime());
        if (ticket == null) throw CaptureDiagnostics.failure("screenshot_timeout", captures.current(), SystemClock.elapsedRealtime());
        main.post(() -> {
            try {
                if (!ticket.requested()) { captures.finish(ticket); return; }
                if (deadline != null) deadline.check();
                requireGeneration(currentGeneration);
                if (deadline != null) {
                    policy.requireOperation("observe");
                    policy.requireApp(before.packageName);
                    if (includePixels && !policy.screenshots()) throw new ApiException("forbidden", "Screenshot permission was removed");
                }
                lastCaptureElapsed = SystemClock.elapsedRealtime();
                takeScreenshotOfWindow(before.windowId, getMainExecutor(), new TakeScreenshotCallback() {
                    @Override public void onSuccess(ScreenshotResult result) {
                        android.hardware.HardwareBuffer buffer = result.getHardwareBuffer();
                        if (buffer == null) { failCapture(ticket, CaptureDiagnostics.failure("screenshot_internal_error")); return; }
                        if (!captures.encoding(ticket)) { buffer.close(); return; }
                        try {
                            // Encoding must not block the main thread that handles stop and consent.
                            // The coordinator allows only one queued or active encoder task.
                            screenshotEncoder.execute(() -> captures.encode(ticket, () -> {
                                try (buffer) {
                                    requireGeneration(currentGeneration);
                                    requireCaptureDeadline(deadline);
                                    if (ticket.abandoned()) throw CaptureDiagnostics.failure("screenshot_timeout");
                                    if (!Policy.capturePixels(buffer.getWidth(), buffer.getHeight())) throw CaptureDiagnostics.failure("screenshot_too_large");
                                    if (buffer.getWidth() != before.windowBounds.width() || buffer.getHeight() != before.windowBounds.height())
                                        throw CaptureDiagnostics.failure("screenshot_geometry_changed");
                                    // OS success and exact buffer geometry establish the secure-window
                                    // probe. Tree-only callers do not need a bitmap or encoded pixels.
                                    byte[] bytes = includePixels ? encodeScreenshot(before, buffer, result.getColorSpace()) : new byte[0];
                                    requireGeneration(currentGeneration);
                                    requireCaptureDeadline(deadline);
                                    return bytes;
                                }
                            }));
                        } catch (java.util.concurrent.RejectedExecutionException rejected) {
                            buffer.close(); captures.finish(ticket);
                            ticket.result.completeExceptionally(captureError(rejected, ticket));
                        }
                    }
                    @Override public void onFailure(int errorCode) {
                        captures.frameworkFailure(ticket, errorCode, captureError(CaptureDiagnostics.failure(CaptureDiagnostics.androidCode(errorCode)), ticket));
                    }
                });
            } catch (Exception error) { failCapture(ticket, error); }
        });
        // Android's accessibility client schedules its own failure callback at five
        // seconds. Allow bounded delivery slack; action deadlines remain independent.
        try {
            byte[] result = ticket.result.get(deadline == null ? 6000 : deadline.remaining(6000), TimeUnit.MILLISECONDS);
            if (deadline != null) deadline.check();
            return result;
        }
        catch (java.util.concurrent.ExecutionException failed) {
            if (failed.getCause() instanceof ApiException denied) {
                ApiException failure = captureError(denied, ticket);
                if (deadline != null && deadline.bounded && ticket.recoveryEligible())
                    throw new ObservationRecovery.RetryableCaptureFailure(failure, SystemClock.elapsedRealtime() - ticket.started);
                throw failure;
            }
            throw CaptureDiagnostics.failure("screenshot_internal_error", ticket, SystemClock.elapsedRealtime());
        }
        catch (ObservationRecovery.DeadlineExceeded expired) {
            captures.abandon(ticket);
            ApiException failure = CaptureDiagnostics.failure("screenshot_timeout", ticket, SystemClock.elapsedRealtime());
            ticket.result.completeExceptionally(failure);
            throw failure;
        }
        catch (java.util.concurrent.TimeoutException timeout) {
            captures.abandon(ticket);
            ApiException failure = CaptureDiagnostics.failure("screenshot_timeout", ticket, SystemClock.elapsedRealtime());
            ticket.result.completeExceptionally(failure);
            throw failure;
        }
        catch (InterruptedException interrupted) {
            captures.abandon(ticket);
            ApiException failure = CaptureDiagnostics.failure("screenshot_internal_error", ticket, SystemClock.elapsedRealtime());
            ticket.result.completeExceptionally(failure);
            Thread.currentThread().interrupt();
            throw failure;
        }
    }

    private byte[] encodeScreenshot(Observation before, android.hardware.HardwareBuffer buffer, android.graphics.ColorSpace colorSpace) throws ApiException {
        if (!Policy.capturePixels(buffer.getWidth(), buffer.getHeight())) throw CaptureDiagnostics.failure("screenshot_too_large");
        Bitmap bitmap = Bitmap.wrapHardwareBuffer(buffer, colorSpace);
        if (bitmap == null) throw CaptureDiagnostics.failure("screenshot_internal_error");
        try {
            if (bitmap.getWidth() != before.windowBounds.width() || bitmap.getHeight() != before.windowBounds.height())
                throw CaptureDiagnostics.failure("screenshot_geometry_changed");
            CappedImageOutput out = new CappedImageOutput(Policy.MAX_PNG_BYTES);
            Bitmap cropped = Bitmap.createBitmap(bitmap, before.bounds.left - before.windowBounds.left, before.bounds.top - before.windowBounds.top, before.bounds.width(), before.bounds.height());
            try {
                boolean encoded;
                try { encoded = cropped.compress(Bitmap.CompressFormat.PNG, 100, out); }
                catch (Exception failed) {
                    if (out.exceeded()) throw CaptureDiagnostics.failure("screenshot_too_large");
                    throw CaptureDiagnostics.failure("screenshot_internal_error");
                }
                if (out.exceeded()) throw CaptureDiagnostics.failure("screenshot_too_large");
                if (!encoded) throw CaptureDiagnostics.failure("screenshot_internal_error");
            } finally { if (cropped != bitmap) cropped.recycle(); }
            try { return out.bytes(); }
            catch (java.io.IOException limited) { throw CaptureDiagnostics.failure("screenshot_too_large"); }
        } finally { bitmap.recycle(); }
    }
    private ApiException captureError(Exception error, CaptureCoordinator.Ticket ticket) {
        if (error instanceof ObservationRecovery.DeadlineExceeded)
            return CaptureDiagnostics.failure("screenshot_timeout", ticket, SystemClock.elapsedRealtime());
        if (error instanceof ApiException denied) {
            if (!CaptureDiagnostics.known(denied.code)) return denied;
            return CaptureDiagnostics.failure(denied.code, ticket, SystemClock.elapsedRealtime());
        }
        return CaptureDiagnostics.failure("screenshot_internal_error", ticket, SystemClock.elapsedRealtime());
    }
    private static void requireCaptureDeadline(ObservationRecovery.Deadline deadline) throws ApiException {
        if (deadline == null) return;
        try { deadline.check(); }
        catch (ObservationRecovery.DeadlineExceeded expired) { throw CaptureDiagnostics.failure("screenshot_timeout"); }
    }
    private void failCapture(CaptureCoordinator.Ticket ticket, Exception error) {
        captures.failBeforeEncoding(ticket, captureError(error, ticket));
    }

    private Observation requireObservation(JSONObject params) throws ApiException {
        String id = Json.string(params, "observationId", 96);
        String expected = Json.string(params, "expectedPackage", 200);
        Observation observation = latest;
        if (observation == null || !observation.id.equals(id) || !observation.packageName.equals(expected)
                || !Policy.fresh(SystemClock.elapsedRealtime(), observation.elapsed)) throw new ApiException("stale_observation", "A fresh matching observation is required");
        policy.requireApp(expected);
        return observation;
    }

    private JSONObject mutate(String method, JSONObject params, long currentGeneration) throws Exception {
        double deadlineAt = Json.number(params, "deadlineAt");
        long remaining = (long) deadlineAt - System.currentTimeMillis();
        if (deadlineAt != Math.rint(deadlineAt) || remaining <= 0 || remaining > 45_000) throw new ApiException("deadline_expired", "Action requires a deadline no more than 45 seconds away");
        long deadlineElapsed = SystemClock.elapsedRealtime() + remaining;
        Observation observation = method.equals("app.launch") ? null : requireObservation(params);
        String target = method.equals("app.launch") ? Json.string(params, "packageName", 200) : observation.packageName;
        policy.requireApp(target);
        if (!target.equals(Json.string(params, "expectedPackage", 200))) throw new ApiException("forbidden", "Target package does not match request scope");
        String identity = policy.identity(target);
        JSONObject actionParams = new JSONObject(params.toString());
        actionParams.remove("deadlineAt");
        validateAction(method, actionParams, observation);
        if (observation != null) {
            Observation current = onMain(() -> Observation.capture(this, Set.of(target)));
            if (!observation.same(current)) throw new ApiException("stale_observation", "Window changed since observation");
        }
        if (method.equals("fixture.increment")) {
            requireFixture(target);
            JSONObject result = execute(method, actionParams, observation, currentGeneration, deadlineElapsed, false);
            latest = null;
            return result;
        }
        if (!biometricAvailable()) throw new ApiException("consent_unavailable", "Enroll a strong biometric on the phone to authorize actions");
        ConsentActivity.Pending pending = new ConsentActivity.Pending(method, target, params.toString(), ActionReview.describe(method, params, observation));
        consent = pending;
        main.postDelayed(pending::cancel, Math.max(1, deadlineElapsed - SystemClock.elapsedRealtime()));
        status = "Paused: waiting for on-device biometric consent";
        main.post(() -> {
            try {
                requireGeneration(currentGeneration);
                startActivity(new Intent(this, ConsentActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK).putExtra("nonce", pending.nonce));
            } catch (Exception error) { pending.result.complete(false); }
        });
        boolean authorized = false;
        try { authorized = pending.result.get(Math.min(40_000, remaining), TimeUnit.MILLISECONDS); }
        catch (Exception timeout) { authorized = false; }
        finally {
            pending.cancel(); if (consent == pending) consent = null;
            if (token != null && generation == currentGeneration) status = authorized ? "Rechecking the selected app" : "Active: action denied or cancelled";
        }
        if (!authorized) throw new ApiException("consent_denied", "On-device biometric consent was denied or timed out");
        requireGeneration(currentGeneration);
        if (!identity.equals(policy.identity(target))) throw new ApiException("stale_observation", "App identity changed during consent");
        policy.requireOperation(method);
        policy.requireApp(target);
        // The consent Activity finishes before execution. Wait only for return to the exact original window.
        if (observation != null) {
            long until = SystemClock.elapsedRealtime() + 2500;
            boolean restored = false;
            while (SystemClock.elapsedRealtime() < until) {
                requireGeneration(currentGeneration);
                try {
                    Observation current = onMain(() -> Observation.capture(this, Set.of(target)));
                    // Full capture still rejects protected content and overlays. Only reviewed Home
                    // may tolerate changed app content; it must retain the exact original context.
                    if (observation.sameAfterConsent(current, method, actionParams.optString("key"))) {
                        restored = true;
                        break;
                    }
                    // Insets or app rendering may settle after focus returns. Other actions still
                    // need their original fingerprint, and no action accepts changed geometry.
                    String difference = observation.difference(current);
                    if (difference.equals("window geometry") || difference.equals("tree content")) { Thread.sleep(100); continue; }
                    throw new ApiException("stale_observation", "Window changed during consent: " + difference);
                } catch (ApiException transientWindow) {
                    if (transientWindow.code.equals("stale_observation")) throw transientWindow;
                    Thread.sleep(100);
                }
            }
            if (!restored) throw new ApiException("stale_observation", "Original window did not return after consent");
            // Surface composition can lag accessibility focus/geometry. No action occurs during this settling interval.
            Thread.sleep(250);
        }
        JSONObject result = execute(method, actionParams, observation, currentGeneration, deadlineElapsed, true);
        latest = null;
        status = "Active: last action dispatched; observe its outcome";
        return result;
    }

    private void validateAction(String method, JSONObject p, Observation observation) throws ApiException {
        switch (method) {
            case "app.launch" -> Json.only(p, "packageName", "expectedPackage");
            case "fixture.increment" -> Json.only(p, "observationId", "expectedPackage");
            case "tap" -> { Json.only(p, "observationId", "expectedPackage", "x", "y"); point(p, "x", "y", observation); }
            case "longPress" -> { Json.only(p, "observationId", "expectedPackage", "x", "y", "durationMs"); point(p, "x", "y", observation); duration(p); }
            case "swipe" -> {
                Json.only(p, "observationId", "expectedPackage", "points", "durationMs"); duration(p);
                if (!(p.opt("points") instanceof JSONArray points) || points.length() < 2 || points.length() > 20) throw new ApiException("invalid_request", "Swipe needs 2 to 20 points");
                for (int i = 0; i < points.length(); i++) {
                    if (!(points.opt(i) instanceof JSONObject point)) throw new ApiException("invalid_request", "Invalid swipe point");
                    Json.only(point, "x", "y"); point(point, "x", "y", observation);
                }
            }
            case "pinch" -> {
                Json.only(p, "observationId", "expectedPackage", "centerX", "centerY", "scale", "durationMs"); duration(p);
                point(p, "centerX", "centerY", observation);
                double scale = Json.number(p, "scale");
                if (scale < 0.5 || scale > 2 || scale == 1) throw new ApiException("invalid_request", "Pinch scale must be 0.5 to 2 and differ from 1");
                float radius = Math.min(observation.bounds.width(), observation.bounds.height()) * 0.1f;
                float x = (float) Json.number(p, "centerX") + observation.bounds.left, y = (float) Json.number(p, "centerY") + observation.bounds.top;
                float extent = radius * Math.max(1f, (float) scale);
                if (!observation.permitsScreenTouch(x - extent, y) || !observation.permitsScreenTouch(x + extent, y))
                    throw new ApiException("invalid_request", "Pinch extends beyond the touch-safe area");
            }
            case "type", "node.click" -> {
                if (method.equals("type")) { Json.only(p, "observationId", "expectedPackage", "nodeId", "text"); Json.string(p, "text", 2000); }
                else Json.only(p, "observationId", "expectedPackage", "nodeId");
                String nodeId = Json.string(p, "nodeId", 96);
                AccessibilityNodeInfo node = observation.references.get(nodeId);
                if (node == null || !node.isEnabled() || (method.equals("type") ? !node.isEditable() : !node.isClickable()))
                    throw new ApiException("invalid_request", "Node does not support this action");
            }
            case "node.scroll" -> {
                Json.only(p, "observationId", "expectedPackage", "nodeId", "direction");
                int action = NodeSemantics.scrollAction(Json.string(p, "direction", 8));
                AccessibilityNodeInfo node = observation.references.get(Json.string(p, "nodeId", 96));
                if (node == null || !node.isEnabled() || !node.isScrollable() || !NodeSemantics.supports(node, action))
                    throw new ApiException("invalid_request", "Node does not support this scroll direction");
            }
            case "key" -> {
                Json.only(p, "observationId", "expectedPackage", "key");
                if (!Set.of("back", "home").contains(Json.string(p, "key", 8))) throw new ApiException("invalid_request", "Only back and home are supported");
            }
            default -> throw new ApiException("unsupported_method", "Unsupported action");
        }
    }
    private void point(JSONObject point, String xKey, String yKey, Observation observation) throws ApiException {
        if (!observation.permitsTouch(Json.number(point, xKey), Json.number(point, yKey)))
            throw new ApiException("invalid_request", "Coordinate is outside the touch-safe area");
    }
    private long duration(JSONObject p) throws ApiException {
        double duration = Json.number(p, "durationMs");
        if (duration != Math.rint(duration) || !Policy.duration((long) duration)) throw new ApiException("invalid_request", "Duration must be 100 to 2000 ms");
        return (long) duration;
    }

    private void requireFixture(String target) throws ApiException {
        String fixture = getPackageName().endsWith(".debug") ? "io.github.quintond.orchestrator.phonefixture.debug" : "io.github.quintond.orchestrator.phonefixture";
        if (!target.equals(fixture) || !policy.signer(target).equals(policy.signer(getPackageName()))) throw new ApiException("forbidden", "Fixture identity does not match the companion signer");
        try {
            if (getPackageManager().getPackageInfo(target, android.content.pm.PackageManager.PackageInfoFlags.of(0)).getLongVersionCode() != 1)
                throw new ApiException("forbidden", "Unrecognized fixture version");
        } catch (android.content.pm.PackageManager.NameNotFoundException missing) { throw new ApiException("app_unavailable", "Fixture unavailable"); }
    }
    private JSONObject execute(String method, JSONObject p, Observation observation, long currentGeneration, long deadlineElapsed, boolean afterConsent) throws Exception {
        if (observation != null) captureWindow(observation, currentGeneration, false);
        CompletableFuture<Boolean> gesture = new CompletableFuture<>();
        boolean accepted = onMain(() -> {
            synchronized (PhoneService.this) {
            requireGeneration(currentGeneration);
            if (getSystemService(android.app.KeyguardManager.class).isKeyguardLocked()) throw new ApiException("protected_window", "Device is locked");
            if (SystemClock.elapsedRealtime() >= deadlineElapsed) throw new ApiException("deadline_expired", "Action deadline expired before dispatch");
            policy.requireOperation(method);
            Observation current = null;
            if (observation != null) {
                if (!Policy.fresh(SystemClock.elapsedRealtime(), observation.elapsed)) throw new ApiException("stale_observation", "Observation expired during consent");
                current = Observation.capture(this, Set.of(observation.packageName));
                if (!(afterConsent ? observation.sameAfterConsent(current, method, p.optString("key")) : observation.same(current))) throw new ApiException("stale_observation", "Target changed immediately before execution");
                validateAction(method, p, current);
            }
            if (SystemClock.elapsedRealtime() >= deadlineElapsed) throw new ApiException("deadline_expired", "Action deadline expired before dispatch");
            if (method.equals("app.launch")) {
                String target = Json.string(p, "packageName", 200);
                policy.requireApp(target);
                Intent launch = getPackageManager().getLaunchIntentForPackage(target);
                if (launch == null || launch.getComponent() == null || !target.equals(launch.getComponent().getPackageName())) throw new ApiException("app_unavailable", "No matching launch component");
                startActivity(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                return true;
            }
            if (method.equals("fixture.increment")) {
                requireFixture(current.packageName);
                java.util.List<AccessibilityNodeInfo> buttons = getRootInActiveWindow().findAccessibilityNodeInfosByViewId(current.packageName + ":id/increment");
                if (buttons.size() != 1 || !buttons.get(0).isClickable() || !buttons.get(0).isEnabled() || !"Increment harmless counter".contentEquals(buttons.get(0).getText()))
                    throw new ApiException("stale_observation", "Exact harmless fixture control unavailable");
                return buttons.get(0).performAction(AccessibilityNodeInfo.ACTION_CLICK);
            }
            if (method.equals("key")) return performGlobalAction(p.optString("key").equals("back") ? GLOBAL_ACTION_BACK : GLOBAL_ACTION_HOME);
            if (method.equals("node.click") || method.equals("type") || method.equals("node.scroll")) {
                AccessibilityNodeInfo node = current.references.get(Json.string(p, "nodeId", 96));
                if (node == null || !node.refresh() || node.isPassword() || node.isAccessibilityDataSensitive() || !node.isVisibleToUser() || !node.isEnabled()
                        || node.getPackageName() == null || !current.packageName.contentEquals(node.getPackageName()) || node.getWindowId() != current.windowId
                        || (method.equals("type") ? !node.isEditable() : method.equals("node.scroll") ? !node.isScrollable() : !node.isClickable())) throw new ApiException("stale_observation", "Node is no longer available");
                if (method.equals("node.click")) return node.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                if (method.equals("node.scroll")) {
                    int action = NodeSemantics.scrollAction(Json.string(p, "direction", 8));
                    if (!NodeSemantics.supports(node, action)) throw new ApiException("stale_observation", "Scroll direction is no longer available");
                    return node.performAction(action);
                }
                Bundle args = new Bundle();
                args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, Json.string(p, "text", 2000));
                return node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args);
            }
            GestureDescription.Builder builder = new GestureDescription.Builder();
            long duration = method.equals("tap") ? 100 : duration(p);
            if (method.equals("pinch")) {
                float x = (float) Json.number(p, "centerX") + current.bounds.left;
                float y = (float) Json.number(p, "centerY") + current.bounds.top;
                float radius = Math.min(current.bounds.width(), current.bounds.height()) * 0.1f;
                float scale = (float) Json.number(p, "scale");
                for (int direction : new int[]{-1, 1}) {
                    Path path = new Path(); path.moveTo(x + direction * radius, y); path.lineTo(x + direction * radius * scale, y);
                    builder.addStroke(new GestureDescription.StrokeDescription(path, 0, duration));
                }
            } else {
                Path path = new Path();
                if (method.equals("swipe")) {
                    JSONArray points = p.getJSONArray("points");
                    for (int i = 0; i < points.length(); i++) {
                        JSONObject point = points.getJSONObject(i);
                        float x = (float) Json.number(point, "x") + current.bounds.left, y = (float) Json.number(point, "y") + current.bounds.top;
                        if (i == 0) path.moveTo(x, y); else path.lineTo(x, y);
                    }
                } else path.moveTo((float) Json.number(p, "x") + current.bounds.left, (float) Json.number(p, "y") + current.bounds.top);
                builder.addStroke(new GestureDescription.StrokeDescription(path, 0, duration));
            }
            boolean started = dispatchGesture(builder.build(), new GestureResultCallback() {
                @Override public void onCompleted(GestureDescription description) { gesture.complete(true); }
                @Override public void onCancelled(GestureDescription description) { gesture.complete(false); }
            }, main);
            if (!started) gesture.complete(false);
            return started;
            }
        });
        if (!accepted) throw new ApiException("unknown_action_state", "Android did not confirm action dispatch; do not replay");
        if (Set.of("tap", "longPress", "swipe", "pinch").contains(method)) {
            try { if (!gesture.get(5, TimeUnit.SECONDS)) throw new ApiException("unknown_action_state", "Gesture cancelled; partial effects are possible"); }
            catch (java.util.concurrent.TimeoutException timeout) { throw new ApiException("unknown_action_state", "Gesture outcome unknown; do not replay"); }
        }
        return Json.object("status", "dispatched", "verified", false);
    }

    private <T> T onMain(Callable<T> task) throws Exception {
        FutureTask<T> future = new FutureTask<>(task);
        main.post(future);
        try { return future.get(5, TimeUnit.SECONDS); }
        catch (java.util.concurrent.ExecutionException failure) {
            if (failure.getCause() instanceof Exception cause) throw cause;
            throw failure;
        } catch (java.util.concurrent.TimeoutException timeout) {
            future.cancel(false);
            throw new ApiException("unknown_action_state", "Main-thread operation timed out; do not replay actions");
        }
    }
}
