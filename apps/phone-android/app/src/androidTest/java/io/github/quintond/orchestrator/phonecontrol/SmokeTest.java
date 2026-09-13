// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
package io.github.quintond.orchestrator.phonecontrol;

import android.app.Instrumentation;
import android.app.UiAutomation;
import android.content.Intent;
import android.os.Bundle;
import android.view.accessibility.AccessibilityNodeInfo;
import org.json.JSONArray;
import org.json.JSONObject;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/** Explicit disposable-device test runner; not packaged in the companion APK. */
public final class SmokeTest extends Instrumentation {
    private String token;
    private final String fixture = "io.github.quintond.orchestrator.phonefixture.debug";
    private int assertions;
    private boolean hostProbe;
    private boolean liveAgents;
    private boolean biometricProbe;
    private boolean documentProbe;
    private String documentRun;
    private int documentSeed;
    private String probeMode;
    @Override public void onCreate(Bundle arguments) {
        super.onCreate(arguments);
        hostProbe = arguments != null && "true".equals(arguments.getString("hostProbe"));
        liveAgents = arguments != null && "true".equals(arguments.getString("liveAgents"));
        biometricProbe = arguments != null && "true".equals(arguments.getString("biometricProbe"));
        documentProbe = arguments != null && "true".equals(arguments.getString("documentProbe"));
        documentRun = arguments == null ? "" : arguments.getString("documentRun", "");
        documentSeed = arguments == null ? 0 : Integer.parseInt(arguments.getString("documentSeed", "0"));
        probeMode = arguments == null ? "full" : arguments.getString("probeMode", "full");
        start();
    }
    @Override public void onStart() {
        Bundle result = new Bundle();
        String stage = "configuration";
        try {
            if (documentProbe && (hostProbe || liveAgents || biometricProbe || !getTargetContext().getPackageName().endsWith(".debug")
                    || !documentRun.matches("[a-f0-9]{32}") || !Set.of(17, 29, 43).contains(documentSeed)))
                throw new IllegalArgumentException("documentProbe requires a bounded debug-only document case");
            if (liveAgents && (!hostProbe || biometricProbe || !getTargetContext().getPackageName().endsWith(".debug")))
                throw new IllegalArgumentException("liveAgents requires a debug hostProbe without biometricProbe");
            stage = "accessibility_automation";
            UiAutomation automation = getUiAutomation(UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES);
            stage = "accessibility_setup";
            // am instrument restarts the process. Wait for the manager's cached disable
            // acknowledgement before re-enabling; DB writes alone can be coalesced.
            try (BoundedSetupShell setupShell = new BoundedSetupShell(() -> {
                android.os.ParcelFileDescriptor[] pipes = automation.executeShellCommandRwe("/system/bin/sh");
                if (pipes == null || pipes.length != 3 || pipes[0] == null || pipes[1] == null || pipes[2] == null) {
                    if (pipes != null) for (android.os.ParcelFileDescriptor pipe : pipes) if (pipe != null) try { pipe.close(); } catch (java.io.IOException ignored) { /* Close every returned pipe. */ }
                    throw new java.io.IOException("Disposable shell pipes unavailable");
                }
                return new BoundedSetupShell.Channel(new android.os.ParcelFileDescriptor.AutoCloseInputStream(pipes[0]),
                        new android.os.ParcelFileDescriptor.AutoCloseOutputStream(pipes[1]),
                        new android.os.ParcelFileDescriptor.AutoCloseInputStream(pipes[2]));
            })) {
                AccessibilitySetup.prepare(getTargetContext().getPackageName() + "/io.github.quintond.orchestrator.phonecontrol.PhoneService",
                        setupShell, () -> PhoneService.instance != null, android.os.SystemClock::elapsedRealtime, Thread::sleep);
            }
            require(PhoneService.instance != null, "Accessibility service must be enabled on the disposable emulator");
            PhoneService service = PhoneService.instance;
            stage = "session_setup";
            runOnMainSync(() -> {
                try {
                    service.stopSession("Disposable fixture QA setup");
                    for (String name : service.policy.apps()) service.policy.app(name, false);
                    service.policy.app(documentProbe ? DocumentProbe.APP : fixture, true);
                    service.policy.screenshots(hostProbe || biometricProbe || documentProbe);
                    for (String method : Policy.OPERATIONS) service.policy.operation(method, documentProbe ? Set.of("observe", "type", "key").contains(method)
                            : biometricProbe || Set.of("observe", "apps.list", "fixture.increment", "tap", "swipe", "pinch", "type").contains(method));
                    service.startSession();
                    token = service.pairingToken();
                } catch (ApiException failed) { throw new IllegalStateException(failed.code); }
            });
            stage = "describe";
            JSONObject described = call("describe", Json.object()).getJSONObject("result");
            require(described.getInt("protocolVersion") == 1 && !described.has("token"), "Describe is safe and versioned");
            if (documentProbe) {
                stage = "document_probe";
                new DocumentProbe(this, service, documentRun, documentSeed).run();
                service.stopSession("Document probe complete");
                result.putString("stream", "PHONE_DOCUMENT_COMPLETE " + documentSeed + " " + assertions + "\n");
                finish(android.app.Activity.RESULT_OK, result);
                return;
            }
            stage = "fixture_launch";
            launch(fixture + "/io.github.quintond.orchestrator.phonefixture.FixtureActivity");
            Thread.sleep(1500);
            if (biometricProbe) {
                stage = "biometric_probe";
                require(service.biometricAvailable(), "Enroll an emulator strong fingerprint before running biometricProbe");
                BiometricProbe probe = new BiometricProbe(this, service);
                if (probeMode.equals("layout")) probe.layout();
                else if (probeMode.equals("key-rotation")) probe.keyRotation();
                else if (probeMode.equals("inflight-stop")) probe.inflightStop();
                else if (probeMode.equals("semantic")) probe.semantic();
                else if (probeMode.equals("home-lifecycle")) probe.homeLifecycle();
                else probe.run();
                service.stopSession("Biometric probe complete");
                result.putString("stream", "PASS: " + assertions + " biometric workflow assertions (emulated sensor; not hardware consent proof).\n");
                finish(android.app.Activity.RESULT_OK, result);
                return;
            }
            if (hostProbe) {
                stage = "host_probe";
                java.io.File tokenFile = new java.io.File(getTargetContext().getFilesDir(), "phone-qa-token");
                java.io.File stopFile = new java.io.File(getTargetContext().getFilesDir(), "phone-qa-stop");
                java.nio.file.Files.deleteIfExists(stopFile.toPath());
                int leaseSeconds = liveAgents ? 360 : 180;
                long probeStarted = android.os.SystemClock.elapsedRealtime();
                String endReason = "probe_error";
                try {
                    java.nio.file.Files.write(tokenFile.toPath(), token.getBytes(StandardCharsets.US_ASCII));
                    probeStarted = android.os.SystemClock.elapsedRealtime();
                    long deadline = probeStarted + leaseSeconds * 1000L;
                    Bundle ready = new Bundle(); ready.putString("stream", "PHONE_HOST_PROBE_READY (private test token; " + leaseSeconds + " second maximum)\n"); sendStatus(1, ready);
                    while (android.os.SystemClock.elapsedRealtime() < deadline && !stopFile.exists() && service.pairingToken() != null) Thread.sleep(200);
                    endReason = android.os.SystemClock.elapsedRealtime() >= deadline ? "probe_deadline" : stopFile.exists() ? "host_stop_file" : probeEndReason(service.status());
                } finally {
                    try {
                        // Fixed test-only facts: never export status text, tokens or UI data.
                        result.putString("phone_qa_probe_end_reason", endReason);
                        result.putLong("phone_qa_probe_elapsed_ms", android.os.SystemClock.elapsedRealtime() - probeStarted);
                        result.putInt("phone_qa_probe_lease_seconds", leaseSeconds);
                        result.putBoolean("phone_qa_probe_interactive", getTargetContext().getSystemService(android.os.PowerManager.class).isInteractive());
                        result.putBoolean("phone_qa_probe_keyguard_locked", getTargetContext().getSystemService(android.app.KeyguardManager.class).isKeyguardLocked());
                    } finally {
                        service.stopSession("Host probe complete");
                        java.nio.file.Files.deleteIfExists(tokenFile.toPath()); java.nio.file.Files.deleteIfExists(stopFile.toPath());
                    }
                }
                result.putString("stream", "PASS: host probe stopped and private test credential removed.\n");
                finish(android.app.Activity.RESULT_OK, result);
                return;
            }
            stage = "initial_observation";
            JSONObject observation = initialObservation();
            require(!observation.has("blockedReason") && observation.getJSONArray("nodes").length() > 0, "Real active-window observation available: " + observation.optString("blockedReason"));
            stage = "native_assertions";
            require(!observation.has("screenshot"), "Screenshot omitted by default");
            require(!service.policy.screenshots(), "Screenshot disclosure starts disabled in this test session");
            JSONObject pixelDenial = call("observe", Json.object("allowedPackages", new JSONArray().put(fixture), "includeScreenshot", true));
            require(pixelDenial.optJSONObject("error") != null && pixelDenial.getJSONObject("error").getString("code").equals("forbidden"), "Caller cannot opt into pixels without owner permission");
            runOnMainSync(() -> {
                try {
                    service.stopSession("Owner changes screenshot disclosure in emulator QA");
                    service.policy.screenshots(true);
                    service.startSession(); token = service.pairingToken();
                } catch (ApiException failed) { throw new IllegalStateException(failed.code); }
            });
            for (int i = 0; i < observation.getJSONArray("nodes").length(); i++) {
                JSONObject node = observation.getJSONArray("nodes").getJSONObject(i);
                require(Policy.validId(node.getString("id")), "Safe node id");
                if (node.getBoolean("editable")) require(!node.has("text"), "Editable values redacted");
            }
            Thread.sleep(400);
            JSONObject pixels = observe(true);
            require(pixels.getJSONObject("screenshot").getString("mimeType").equals("image/png"), "Explicit window screenshot works");
            require(renderedFixture(pixels), "Fixture screenshot contains visible rendered color variation");
            // Pixel QA decodes and samples a bitmap. Observe again before the
            // separate positive action instead of spending that binding on test work.
            JSONObject actionView = observe(false);
            JSONObject mutation = bound(actionView);
            String id = UUID.randomUUID().toString();
            JSONObject action = call("fixture.increment", mutation, id);
            require(action.optJSONObject("result") != null, "Signed fixture dispatch: " + safeError(action));
            JSONObject duplicate = call("fixture.increment", mutation, id);
            require(action.toString().equals(duplicate.toString()), "Duplicate returns persisted receipt");
            JSONObject conflict = new JSONObject(mutation.toString()); conflict.put("deadlineAt", System.currentTimeMillis() + 29_000);
            require(error(call("fixture.increment", conflict, id)).equals("replay_conflict"), "Changed payload cannot reuse id");
            require(error(call("fixture.increment", bound(actionView))).equals("stale_observation"), "Executed observation consumed");
            Thread.sleep(400);
            JSONObject after = observe(false);
            require(Integer.parseInt(counter(after).substring(9)) == (Integer.parseInt(counter(actionView).substring(9)) + 1) % 1000, "Counter changed exactly once and duplicate did not replay");
            JSONObject wrong = bound(after); wrong.put("expectedPackage", "io.github.other.app");
            require(error(call("fixture.increment", wrong)).equals("stale_observation"), "Expected package enforced");
            JSONObject expired = bound(after); expired.put("deadlineAt", System.currentTimeMillis() - 1);
            require(error(call("fixture.increment", expired)).equals("deadline_expired"), "Expired action denied");
            JSONObject invalid = bound(after); invalid.put("x", -1).put("y", 0);
            require(error(call("tap", invalid)).equals("invalid_request"), "Coordinates enforced");
            JSONObject touch = after.getJSONObject("touchBounds");
            int touchLeft = touch.getInt("left"), touchTop = touch.getInt("top"), touchRight = touch.getInt("right"), touchBottom = touch.getInt("bottom");
            require(touchLeft >= 0 && touchTop >= 0 && touchRight <= after.getInt("width") && touchBottom <= after.getInt("height"), "Touch bounds preserve screenshot coordinates");
            double middleY = (touchTop + touchBottom) / 2.0;
            JSONObject edgeTap = bound(after); edgeTap.put("x", touchRight).put("y", middleY);
            require(error(call("tap", edgeTap)).equals("invalid_request"), "Right system gesture boundary denied before consent");
            JSONObject edgeSwipe = bound(after); edgeSwipe.put("durationMs", 300).put("points", new JSONArray(List.of(
                    Json.object("x", (touchLeft + touchRight) / 2.0, "y", middleY), Json.object("x", touchLeft - 1, "y", middleY))));
            require(error(call("swipe", edgeSwipe)).equals("invalid_request"), "Every swipe point excludes system gesture edges");
            JSONObject edgePinch = bound(after); edgePinch.put("centerX", touchLeft + 1).put("centerY", middleY).put("scale", 2).put("durationMs", 300);
            require(error(call("pinch", edgePinch)).equals("invalid_request"), "Pinch endpoint excludes system gesture edges");
            if (!service.biometricAvailable()) {
                JSONObject tap = bound(after); tap.put("x", 100).put("y", 100);
                require(error(call("tap", tap)).equals("consent_unavailable"), "General action requires strong biometric");
            }
            click("Toggle secure window"); Thread.sleep(500);
            JSONObject secure = observe(false);
            require(secure.has("blockedReason") && secure.getJSONArray("nodes").length() == 0 && !secure.has("screenshot"), "Secure window exports no tree or pixels");
            require(secure.optString("blockedReason").equals("screenshot_secure_window"), "Secure-window denial has a precise safe diagnostic: " + secure.optString("blockedReason"));
            click("Toggle secure window"); Thread.sleep(500);
            click("Toggle password field"); Thread.sleep(500);
            require(error(call("observe", scope(false))).equals("sensitive_window"), "Password window denied");
            click("Toggle password field"); Thread.sleep(500);
            require(error(call("observe", Json.object("allowedPackages", new JSONArray(List.of("io.github.other.app"))))).equals("forbidden"), "Caller scope intersects phone grants");
            launch(getTargetContext().getPackageName() + "/io.github.quintond.orchestrator.phonecontrol.MainActivity"); Thread.sleep(500);
            require(error(call("observe", scope(false))).equals("forbidden"), "Companion surface excluded");
            require(call("stop", Json.object()).getJSONObject("result").getString("status").equals("stopped"), "Authenticated stop works without operation grant");
            require(service.pairingToken() == null, "Stop revokes token");
            result.putString("stream", "PASS: " + assertions + " native assertions; no token or observation content exported.\n");
            finish(android.app.Activity.RESULT_OK, result);
        } catch (Throwable failed) {
            if (failed instanceof AccessibilitySetup.SetupFailure setupFailure) {
                stage = setupFailure.stage;
                result.putString("phone_qa_setup_failure", setupFailure.facts());
            }
            if (PhoneService.instance != null) PhoneService.instance.stopSession("Native fixture QA failed");
            // Fixed source-owned labels distinguish startup failures without exporting
            // exception text, active-app names, credentials or observation content.
            result.putString("phone_qa_failure_stage", stage);
            Throwable cause = failed;
            for (int depth = 0; cause != null && depth < 4; depth++, cause = cause.getCause()) {
                if (cause instanceof java.util.regex.PatternSyntaxException syntax) {
                    int index = syntax.getIndex();
                    result.putString("phone_qa_failure_cause", "PatternSyntaxException:" + (index >= -1 && index <= 65_536 ? index : -1));
                    break;
                }
            }
            result.putString("stream", "FAIL after " + assertions + " assertions: " + failed.getClass().getSimpleName() + ": " + failed.getMessage() + "\n");
            finish(android.app.Activity.RESULT_CANCELED, result);
        } finally { token = null; }
    }
    private static String probeEndReason(String status) {
        return switch (status) {
            case "Device screen turned off" -> "screen_off";
            case "Accessibility interrupted" -> "accessibility_interrupted";
            case "Accessibility disconnected" -> "accessibility_disconnected";
            case "Accessibility disabled" -> "accessibility_disabled";
            case "Session expired" -> "session_deadline";
            case "Listener unavailable" -> "listener_unavailable";
            case "Stopped by paired host" -> "paired_host_stop";
            case "Stopped on phone" -> "owner_stop";
            case "Policy changed on phone" -> "policy_changed";
            default -> "other_session_end";
        };
    }
    void require(boolean condition, String name) { if (!condition) throw new AssertionError(name); assertions++; }
    private void shell(String command) throws Exception {
        try (android.os.ParcelFileDescriptor descriptor = getUiAutomation(UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES).executeShellCommand(command);
                java.io.FileInputStream result = new java.io.FileInputStream(descriptor.getFileDescriptor())) { result.readNBytes(4096); }
    }
    String error(JSONObject response) { return response.optJSONObject("error") == null ? "none" : response.optJSONObject("error").optString("code"); }
    private String safeError(JSONObject response) { return error(response) + (response.optJSONObject("error") == null ? "" : ": " + response.optJSONObject("error").optString("message")); }
    JSONObject scope(boolean pixels) { return Json.object("allowedPackages", new JSONArray(List.of(fixture)), "includeScreenshot", pixels); }
    private JSONObject initialObservation() throws Exception {
        long deadline = android.os.SystemClock.elapsedRealtime() + 8000;
        int rejected = 0;
        while (true) {
            JSONObject response = call("observe", scope(false));
            JSONObject result = response.optJSONObject("result");
            if (result != null) {
                if (rejected > 0) {
                    Bundle waited = new Bundle(); waited.putString("stream", "PHONE_NATIVE_GEOMETRY_WAIT " + rejected + "\n"); sendStatus(1, waited);
                }
                return result;
            }
            JSONObject failure = response.getJSONObject("error");
            JSONObject details = failure.optJSONObject("details");
            // APK replacement can animate the restored task past the fixed launch delay.
            // Only this demonstrated startup geometry transition is a readiness wait.
            if (!failure.optString("code").equals("stale_observation") || details == null || !details.optString("stateDifference").equals("window_geometry")
                    || ++rejected >= 8 || android.os.SystemClock.elapsedRealtime() >= deadline)
                throw new AssertionError("Initial observation refused: " + failure.optString("code")
                        + "; stateDifference=" + safeDifference(details));
            Thread.sleep(200);
        }
    }
    private String safeDifference(JSONObject details) {
        String difference = details == null ? "none" : details.optString("stateDifference", "none");
        return Set.of("none", "package", "app_identity", "window_identity", "window_geometry", "tree_content", "content_event").contains(difference)
                ? difference : "none";
    }
    private boolean renderedFixture(JSONObject observation) throws Exception {
        byte[] png = android.util.Base64.decode(observation.getJSONObject("screenshot").getString("base64"), android.util.Base64.NO_WRAP);
        android.graphics.BitmapFactory.Options bounds = new android.graphics.BitmapFactory.Options(); bounds.inJustDecodeBounds = true;
        android.graphics.BitmapFactory.decodeByteArray(png, 0, png.length, bounds);
        if (bounds.outWidth != observation.getInt("width") || bounds.outHeight != observation.getInt("height")
                || !Policy.capturePixels(bounds.outWidth, bounds.outHeight)) return false;
        android.graphics.BitmapFactory.Options sampled = new android.graphics.BitmapFactory.Options(); sampled.inSampleSize = 4;
        android.graphics.Bitmap bitmap = android.graphics.BitmapFactory.decodeByteArray(png, 0, png.length, sampled);
        if (bitmap == null) return false;
        try {
            int columns = Math.min(64, bitmap.getWidth()), rows = Math.min(64, bitmap.getHeight()), visible = 0;
            int[] low = {255, 255, 255}, high = {0, 0, 0};
            // This assertion belongs only to the known light-theme fixture. A real
            // allowed app may legitimately display an entirely black or solid frame.
            for (int row = 0; row < rows; row++) for (int column = 0; column < columns; column++) {
                int pixel = bitmap.getPixel(column * bitmap.getWidth() / columns, row * bitmap.getHeight() / rows);
                if (android.graphics.Color.alpha(pixel) < 128) continue;
                visible++;
                int[] rgb = {android.graphics.Color.red(pixel), android.graphics.Color.green(pixel), android.graphics.Color.blue(pixel)};
                for (int channel = 0; channel < 3; channel++) {
                    low[channel] = Math.min(low[channel], rgb[channel]); high[channel] = Math.max(high[channel], rgb[channel]);
                }
            }
            return visible >= columns * rows / 2 && Math.max(high[0] - low[0], Math.max(high[1] - low[1], high[2] - low[2])) >= 32;
        } finally { bitmap.recycle(); }
    }
    JSONObject observe(boolean pixels) throws Exception {
        JSONObject response = call("observe", scope(pixels));
        if (response.optJSONObject("result") == null) {
            JSONObject failure = response.getJSONObject("error");
            JSONObject details = failure.optJSONObject("details");
            String difference = details == null ? "none" : details.optString("stateDifference", "none");
            if (!Set.of("none", "package", "app_identity", "window_identity", "window_geometry", "tree_content", "content_event").contains(difference)) difference = "none";
            throw new AssertionError("observe: " + error(response) + ": " + failure.optString("message") + "; stateDifference=" + difference);
        }
        return response.getJSONObject("result");
    }
    JSONObject bound(JSONObject observation) throws Exception { return Json.object("observationId", observation.getString("observationId"), "expectedPackage", fixture, "deadlineAt", System.currentTimeMillis() + 30_000); }
    private String counter(JSONObject observation) throws Exception {
        JSONArray nodes = observation.getJSONArray("nodes");
        for (int i = 0; i < nodes.length(); i++) { String text = nodes.getJSONObject(i).optString("text"); if (text.startsWith("Counter: ")) return text; }
        throw new AssertionError("No counter");
    }
    void launch(String component) throws Exception {
        Intent intent = new Intent().setComponent(android.content.ComponentName.unflattenFromString(component)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getTargetContext().startActivity(intent);
        long until = android.os.SystemClock.elapsedRealtime() + 5000;
        String expected = intent.getComponent().getPackageName();
        while (android.os.SystemClock.elapsedRealtime() < until) {
            AccessibilityNodeInfo root = getUiAutomation(UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES).getRootInActiveWindow();
            if (root != null) {
                boolean ready = expected.contentEquals(root.getPackageName() == null ? "" : root.getPackageName());
                root.recycle();
                if (ready) return;
            }
            Thread.sleep(100);
        }
        throw new AssertionError("Owner fixture launch did not reach the expected app");
    }
    private void click(String label) {
        List<AccessibilityNodeInfo> nodes = getUiAutomation(UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES).getRootInActiveWindow().findAccessibilityNodeInfosByText(label);
        require(nodes.size() == 1 && nodes.get(0).performAction(AccessibilityNodeInfo.ACTION_CLICK), "Fixture QA control available");
    }
    JSONObject call(String method, JSONObject params) throws Exception { return call(method, params, UUID.randomUUID().toString()); }
    private JSONObject call(String method, JSONObject params, String id) throws Exception {
        byte[] body = Json.object("id", id, "method", method, "params", params).toString().getBytes(StandardCharsets.UTF_8);
        try (Socket socket = new Socket("127.0.0.1", Policy.PORT)) {
            socket.setSoTimeout(50_000);
            String header = "POST /v1/call HTTP/1.1\r\nHost: 127.0.0.1:8837\r\nContent-Type: application/json\r\nAuthorization: Bearer " + token + "\r\nContent-Length: " + body.length + "\r\n\r\n";
            socket.getOutputStream().write(header.getBytes(StandardCharsets.US_ASCII)); socket.getOutputStream().write(body);
            byte[] response = socket.getInputStream().readNBytes(6_100_000);
            String text = new String(response, StandardCharsets.UTF_8);
            return new JSONObject(text.substring(text.indexOf("\r\n\r\n") + 4));
        }
    }
}
