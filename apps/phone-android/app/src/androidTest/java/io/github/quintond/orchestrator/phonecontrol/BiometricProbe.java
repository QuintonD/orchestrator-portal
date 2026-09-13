// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
package io.github.quintond.orchestrator.phonecontrol;

import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

/** Real native consent and gesture paths, driven only by the separate emulator test APK. */
final class BiometricProbe {
    private final SmokeTest test;
    private final PhoneService service;
    private final String fixture = "io.github.quintond.orchestrator.phonefixture.debug";
    private int readinessSequence;
    BiometricProbe(SmokeTest test, PhoneService service) { this.test = test; this.service = service; }
    void homeLifecycle() throws Exception {
        openLifecycle("none");
        JSONObject beforeReview = stableObservation();
        android.view.accessibility.AccessibilityNodeInfo increment = lifecycleNode("increment");
        test.require(increment.performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_CLICK) && lifecycleState().clicks() == 1,
                "Independent pre-consent fixture change applied");
        test.require(test.error(test.call("key", parameters("key", beforeReview))).equals("stale_observation"), "Home still requires exact state before review");
        test.require(service.consent == null && lifecycleState().clicks() == 1, "Stale Home neither opens consent nor leaves the fixture");

        openLifecycle("content");
        JSONObject observed = stableObservation();
        int originalWindow = observed.getInt("windowId");
        LifecycleState initial = lifecycleState();
        test.require(!initial.changed() && !initial.checked() && initial.clicks() == 0, "Home starts with unchanged synthetic content");
        CompletableFuture<JSONObject> home = request("key", parameters("key", observed));
        awaitConsent(home); authorize("home-content");
        JSONObject receipt = home.get(35, TimeUnit.SECONDS);
        test.require(receipt.optJSONObject("result") != null, "Home after a pause-time tree change dispatches: " + test.error(receipt));
        android.content.pm.ResolveInfo launcher = test.getTargetContext().getPackageManager().resolveActivity(
                new android.content.Intent(android.content.Intent.ACTION_MAIN).addCategory(android.content.Intent.CATEGORY_HOME),
                android.content.pm.PackageManager.ResolveInfoFlags.of(android.content.pm.PackageManager.MATCH_DEFAULT_ONLY));
        test.require(launcher != null && launcher.activityInfo != null && waitForPackage(launcher.activityInfo.packageName),
                "Independent UiAutomation verifies the actual resolved launcher after one Home request");
        // Return for independent state inspection; this is test orchestration, not another phone action.
        test.getTargetContext().startActivity(lifecycleIntent("content").addFlags(android.content.Intent.FLAG_ACTIVITY_REORDER_TO_FRONT));
        LifecycleState changed = awaitLifecycle(true);
        test.require(changed.checked() && changed.clicks() == 0 && changed.windowId() == originalWindow,
                "The original fixture window changed its label and checkbox with no control activation");

        for (String method : List.of("tap", "back")) {
            openLifecycle("content"); observed = stableObservation(); originalWindow = observed.getInt("windowId");
            CompletableFuture<JSONObject> strict = request(method.equals("back") ? "key" : method, parameters(method, observed));
            awaitConsent(strict); authorize("home-strict-" + method);
            test.require(test.error(strict.get(35, TimeUnit.SECONDS)).equals("stale_observation"), method + " still rejects pause-time content changes");
            changed = awaitLifecycle(true);
            test.require(changed.checked() && changed.clicks() == 0 && changed.windowId() == originalWindow,
                    "Independent fixture state proves the stale " + method + " did not activate a control or leave the window");
        }

        for (String protection : List.of("secure", "password")) {
            openLifecycle(protection); observed = stableObservation(); originalWindow = observed.getInt("windowId");
            CompletableFuture<JSONObject> protectedHome = request("key", parameters("key", observed));
            awaitConsent(protectedHome); authorize("home-" + protection);
            String error = test.error(protectedHome.get(35, TimeUnit.SECONDS));
            test.require(error.equals(protection.equals("secure") ? "screenshot_secure_window" : "stale_observation"),
                    "Home rejects the new " + protection + " protection: " + error);
            changed = awaitLifecycle(true);
            test.require(changed.checked() && changed.clicks() == 0 && changed.windowId() == originalWindow,
                    "Protected Home leaves the changed fixture active without dispatch");
            JSONObject protectedRead = test.call("observe", test.scope(false));
            if (protection.equals("secure")) {
                JSONObject blocked = protectedRead.optJSONObject("result");
                test.require(blocked != null && blocked.optString("blockedReason").equals("screenshot_secure_window")
                        && blocked.getJSONArray("nodes").length() == 0 && !blocked.has("screenshot"), "Independent secure-window read withholds tree and pixels");
            } else test.require(changed.password() && test.error(protectedRead).equals("sensitive_window"),
                    "Independent password state and observation confirm sensitive-window protection");
        }

        for (String authority : List.of("app", "operation")) {
            openLifecycle("content"); observed = stableObservation();
            CompletableFuture<JSONObject> revoked = request("key", parameters("key", observed));
            awaitConsent(revoked);
            try {
                setLifecycleGrant(authority, false);
                authorize("home-revoked-" + authority);
                test.require(test.error(revoked.get(35, TimeUnit.SECONDS)).equals("forbidden"), "Home rechecks the revoked " + authority + " grant after biometrics");
                changed = awaitLifecycle(true);
                boolean removed = authority.equals("app") ? !service.policy.apps().contains(fixture) : !service.policy.operations().contains("key");
                test.require(removed && changed.checked() && changed.clicks() == 0, "Revoked Home leaves the changed fixture active");
            } finally { setLifecycleGrant(authority, true); }
        }

        openLifecycle("content"); observed = stableObservation();
        JSONObject expired = parameters("key", observed).put("deadlineAt", System.currentTimeMillis() + 2500);
        CompletableFuture<JSONObject> timeout = request("key", expired); awaitConsent(timeout);
        test.require(test.error(timeout.get(6, TimeUnit.SECONDS)).equals("consent_denied"), "Home deadline cancels the unapproved request");
        changed = awaitLifecycle(true);
        test.require(service.consent == null && changed.checked() && changed.clicks() == 0, "Expired Home removes consent and leaves the fixture active");

        openLifecycle("content"); observed = stableObservation();
        CompletableFuture<JSONObject> stopped = request("key", parameters("key", observed)); awaitConsent(stopped);
        test.require(test.call("stop", Json.object()).optJSONObject("result") != null, "Stop is available during pending Home review");
        test.require(test.error(stopped.get(5, TimeUnit.SECONDS)).equals("consent_denied"), "Stop cancels pending Home authorization");
        test.require(service.consent == null && service.pairingToken() == null, "Stop removes Home consent and revokes session authority");
        changed = awaitLifecycle(true);
        test.require(changed.checked() && changed.clicks() == 0, "Independent fixture state proves stopped Home did not dispatch");
    }
    private void authorize(String marker) {
        clickReview("Confirm this action with biometrics");
        Bundle ready = new Bundle(); ready.putString("stream", "PHONE_BIOMETRIC_READY " + marker + "\n"); test.sendStatus(2, ready);
    }
    private android.content.Intent lifecycleIntent(String change) {
        return new android.content.Intent().setComponent(android.content.ComponentName.unflattenFromString(
                fixture + "/io.github.quintond.orchestrator.phonefixture.LifecycleFixtureActivity"))
                .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK).putExtra("pauseChange", change);
    }
    private void openLifecycle(String change) throws Exception {
        test.getTargetContext().startActivity(lifecycleIntent(change).addFlags(android.content.Intent.FLAG_ACTIVITY_CLEAR_TASK));
        Thread.sleep(700); awaitLifecycle(false);
    }
    private boolean waitForPackage(String expected) throws InterruptedException {
        long until = android.os.SystemClock.elapsedRealtime() + 4000;
        do {
            android.view.accessibility.AccessibilityNodeInfo root = test.getUiAutomation(android.app.UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES).getRootInActiveWindow();
            if (root != null) {
                boolean ready = expected.contentEquals(root.getPackageName());
                root.recycle();
                if (ready) return true;
            }
            Thread.sleep(50);
        } while (android.os.SystemClock.elapsedRealtime() < until);
        return false;
    }
    private android.view.accessibility.AccessibilityNodeInfo lifecycleNode(String resource) {
        android.view.accessibility.AccessibilityNodeInfo root = test.getUiAutomation(android.app.UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES).getRootInActiveWindow();
        if (root == null || !fixture.contentEquals(root.getPackageName())) throw new AssertionError("Lifecycle fixture is not foreground");
        java.util.List<android.view.accessibility.AccessibilityNodeInfo> nodes = root.findAccessibilityNodeInfosByViewId(fixture + ":id/" + resource);
        if (nodes.size() != 1 || !nodes.get(0).refresh()) throw new AssertionError("Lifecycle fixture target is unavailable");
        return nodes.get(0);
    }
    private record LifecycleState(int windowId, int clicks, boolean changed, boolean checked, boolean password) { }
    private LifecycleState lifecycleState() {
        android.view.accessibility.AccessibilityNodeInfo status = lifecycleNode("lifecycle_status");
        String summary = String.valueOf(lifecycleNode("lifecycle_clicks").getText());
        if (!summary.matches("Action clicks: [0-9]{1,3}")) throw new AssertionError("Lifecycle fixture click count is unavailable");
        return new LifecycleState(status.getWindowId(), Integer.parseInt(summary.substring("Action clicks: ".length())),
                "Pause change applied".contentEquals(status.getText()), lifecycleNode("lifecycle_check").isChecked(), lifecycleNode("lifecycle_input").isPassword());
    }
    private LifecycleState awaitLifecycle(boolean changed) throws Exception {
        long until = android.os.SystemClock.elapsedRealtime() + 4000;
        do {
            try { LifecycleState state = lifecycleState(); if (state.changed() == changed) return state; }
            catch (AssertionError notRestored) { /* Read-only wait for the fixture task to finish returning. */ }
            Thread.sleep(50);
        } while (android.os.SystemClock.elapsedRealtime() < until);
        throw new AssertionError("Lifecycle fixture did not reach the expected synthetic state");
    }
    private void setLifecycleGrant(String authority, boolean allow) {
        test.runOnMainSync(() -> {
            try { if (authority.equals("app")) service.policy.app(fixture, allow); else service.policy.operation("key", allow); }
            catch (ApiException rejected) { throw new IllegalStateException(rejected.code); }
        });
    }
    void semantic() throws Exception {
        test.launch(fixture + "/io.github.quintond.orchestrator.phonefixture.ScrollFixtureActivity"); Thread.sleep(800);
        JSONObject first = stableObservation();
        JSONObject scroll = semanticNode(first, "scroll_document");
        JSONObject check = semanticNode(first, "semantic_check");
        test.require(scroll.optString("className").equals("android.widget.ScrollView") && scroll.optBoolean("enabled") && scroll.optBoolean("scrollable"), "Scrollable identity and state exported");
        test.require(check.optBoolean("checkable") && check.optString("checkedState").equals("checked"), "Checked semantic state exported");
        test.require(scroll.getJSONArray("actions").toString().contains("scrollForward"), "Only supported semantic actions exported");
        JSONObject bad = test.bound(first).put("nodeId", check.getString("id")).put("direction", "forward");
        test.require(test.error(test.call("node.scroll", bad)).equals("invalid_request"), "Non-scrollable control rejected before consent");
        test.require(service.consent == null, "Invalid semantic action creates no consent or dispatch");
        for (String direction : List.of("forward", "backward")) {
            JSONObject observed = stableObservation();
            JSONObject params = test.bound(observed).put("nodeId", semanticNode(observed, "scroll_document").getString("id")).put("direction", direction);
            CompletableFuture<JSONObject> result = request("node.scroll", params);
            awaitConsent(result); clickReview("Confirm this action with biometrics");
            Bundle ready = new Bundle(); ready.putString("stream", "PHONE_BIOMETRIC_READY scroll-" + direction + "\n"); test.sendStatus(2, ready);
            JSONObject receipt = result.get(35, TimeUnit.SECONDS);
            test.require(receipt.optJSONObject("result") != null, "Semantic scroll dispatch: " + test.error(receipt));
            Thread.sleep(500);
            java.util.List<android.view.accessibility.AccessibilityNodeInfo> rows = test.getUiAutomation(android.app.UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES)
                    .getRootInActiveWindow().findAccessibilityNodeInfosByViewId(fixture + ":id/semantic_check");
            boolean visible = rows.size() == 1 && rows.get(0).isVisibleToUser();
            test.require(visible == direction.equals("backward"), "Independent top-row visibility verifies scroll direction");
        }
    }
    private JSONObject semanticNode(JSONObject observation, String resource) throws Exception {
        JSONArray nodes = observation.getJSONArray("nodes"); JSONObject found = null;
        for (int i = 0; i < nodes.length(); i++) if (nodes.getJSONObject(i).optString("resourceId").equals(fixture + ":id/" + resource)) {
            if (found != null) throw new AssertionError("Ambiguous semantic test target"); found = nodes.getJSONObject(i);
        }
        if (found == null) throw new AssertionError("Missing semantic test target"); return found;
    }
    void inflightStop() throws Exception {
        openFixture(); Thread.sleep(700);
        JSONObject observed = stableObservation();
        int[] baseline = padState();
        test.require(baseline != null && baseline[0] == 0 && baseline[1] == 0, "Fresh fixture pad has no injected touches");
        JSONObject params = parameters("longPress", observed); params.put("durationMs", 2000);
        CompletableFuture<JSONObject> action = request("longPress", params);
        awaitConsent(); clickReview("Confirm this action with biometrics");
        Bundle ready = new Bundle(); ready.putString("stream", "PHONE_BIOMETRIC_READY inflight-stop\n"); test.sendStatus(2, ready);
        long waitingUntil = android.os.SystemClock.elapsedRealtime() + 30_000;
        int[] active = null;
        while (android.os.SystemClock.elapsedRealtime() < waitingUntil && !action.isDone()) {
            active = padState();
            if (active != null && active[0] > baseline[0]) break;
            Thread.sleep(25);
        }
        long downObservedAt = android.os.SystemClock.elapsedRealtime();
        test.require(active != null && active[0] == baseline[0] + 1 && active[1] == baseline[1] && !action.isDone(),
                "Actual fixture DOWN with no UP proves the approved gesture is in flight before Stop");
        long stopStartedAt = android.os.SystemClock.elapsedRealtime();
        JSONObject stopped = test.call("stop", Json.object());
        long stopElapsed = android.os.SystemClock.elapsedRealtime() - stopStartedAt;
        JSONObject receipt = stopped.optJSONObject("result");
        test.require(receipt != null && receipt.optString("status").equals("stopped") && receipt.optBoolean("inFlightGestureMayFinish"),
                "Authenticated Stop acknowledges an already-dispatched gesture may finish");
        test.require(stopElapsed <= 1000, "In-flight Stop acknowledgement meets the 1000 ms target");
        test.require(service.pairingToken() == null && service.consent == null, "Stop revokes the session token and any pending consent");
        test.require(test.error(action.get(4, TimeUnit.SECONDS)).equals("unknown_action_state"),
                "Already-dispatched action reconciles as unknown after Stop, never as a safe replay");
        int[] ended = padState();
        while (android.os.SystemClock.elapsedRealtime() - downObservedAt < 2500 && (ended == null || ended[1] == baseline[1])) {
            Thread.sleep(25); ended = padState();
        }
        test.require(ended != null && ended[0] == baseline[0] + 1 && ended[1] == baseline[1] + 1 && ended[2] == baseline[2] + 1
                        && android.os.SystemClock.elapsedRealtime() - downObservedAt <= 2500,
                "The one two-second press finishes within bounded observation slack; Stop did not promise cancellation");
        CompletableFuture<Boolean> rejected = CompletableFuture.supplyAsync(() -> {
            try {
                String code = test.error(test.call("longPress", params));
                return code.equals("unauthorized") || code.equals("session_expired");
            } catch (java.net.ConnectException closedListener) { return true; }
            catch (Exception failure) { return false; }
        });
        test.require(rejected.get(1500, TimeUnit.MILLISECONDS), "A new dispatch using the revoked bearer is rejected promptly");
        int[] afterRejection = padState();
        test.require(afterRejection != null && afterRejection[0] == ended[0] && afterRejection[1] == ended[1],
                "Rejected post-stop request causes no additional fixture touch");
    }
    private int[] padState() {
        android.view.accessibility.AccessibilityNodeInfo root = test.getUiAutomation(android.app.UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES).getRootInActiveWindow();
        if (root == null || !fixture.contentEquals(root.getPackageName())) return null;
        java.util.List<android.view.accessibility.AccessibilityNodeInfo> nodes = root.findAccessibilityNodeInfosByViewId(fixture + ":id/gesture_status");
        if (nodes.size() != 1 || !nodes.get(0).refresh() || nodes.get(0).getText() == null) return null;
        java.util.regex.Matcher values = java.util.regex.Pattern.compile("^Pad: downs ([0-9]+); ups ([0-9]+); pointers [0-9]+; moves [0-9]+; long ([0-9]+)$")
                .matcher(nodes.get(0).getText());
        if (!values.matches()) return null;
        return new int[]{Integer.parseInt(values.group(1)), Integer.parseInt(values.group(2)), Integer.parseInt(values.group(3))};
    }
    void keyRotation() throws Exception {
        JSONObject observed = stableObservation();
        CompletableFuture<JSONObject> denied = request("tap", parameters("tap", observed));
        awaitConsent(); clickReview("Confirm this action with biometrics");
        test.require(test.error(denied.get(5, TimeUnit.SECONDS)).equals("consent_denied"), "Changed biometric enrollment rejects the current action");
        java.security.KeyStore keys = java.security.KeyStore.getInstance("AndroidKeyStore"); keys.load(null);
        test.require(!keys.containsAlias("phone-action-auth"), "Invalidated key removed without unauthenticated fallback");
        Thread.sleep(700);
        CompletableFuture<JSONObject> fresh = request("tap", parameters("tap", stableObservation()));
        awaitConsent(); clickReview("Confirm this action with biometrics");
        Bundle ready = new Bundle(); ready.putString("stream", "PHONE_BIOMETRIC_READY key-rotation-recovery\n"); test.sendStatus(2, ready);
        test.require(fresh.get(35, TimeUnit.SECONDS).optJSONObject("result") != null, "New reviewed action creates a fresh authenticated key");
    }
    void layout() throws Exception {
        android.app.UiAutomation automation = test.getUiAutomation(android.app.UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES);
        try {
            for (int rotation : new int[]{android.app.UiAutomation.ROTATION_FREEZE_0, android.app.UiAutomation.ROTATION_FREEZE_90}) {
                automation.setRotation(rotation); Thread.sleep(800); openFixture(); Thread.sleep(800);
                JSONObject params = parameters("type", stableObservation()); params.put("text", "Exact reviewed text. ".repeat(100));
                // 2000 characters exercises the full supported text limit.
                params.put("text", params.getString("text").substring(0, 2000));
                CompletableFuture<JSONObject> result = request("type", params);
                awaitConsent(result);
                test.runOnMainSync(() -> checkLayout(service.consent.activity.getWindow().getDecorView()));
                clickReview("Deny action");
                test.require(test.error(result.get(5, TimeUnit.SECONDS)).equals("consent_denied"), "Layout review denial remains reachable");
                Thread.sleep(500);
            }
        } finally { automation.setRotation(android.app.UiAutomation.ROTATION_UNFREEZE); }
    }
    private void checkLayout(View decor) {
        android.graphics.Insets safe = decor.getRootWindowInsets().getInsets(android.view.WindowInsets.Type.systemBars() | android.view.WindowInsets.Type.displayCutout());
        java.util.ArrayList<View> views = new java.util.ArrayList<>(); collect(decor, views);
        for (View view : views) {
            if (view instanceof Button || view instanceof android.widget.ScrollView) {
                int[] location = new int[2]; view.getLocationOnScreen(location);
                int[] origin = new int[2]; decor.getLocationOnScreen(origin);
                test.require(view.getHeight() > 0 && location[1] >= safe.top && location[1] + view.getHeight() <= decor.getHeight() - safe.bottom,
                        "Review controls and scroll area stay inside system insets; layoutGeometry=" + location[1] + "," + view.getHeight()
                                + "," + origin[1] + "," + decor.getHeight() + "," + safe.top + "," + safe.bottom);
            }
            if (view instanceof android.widget.TextView text) {
                String content = text.getText().toString();
                test.require(!content.contains("observationId") && !content.contains("deadlineAt"), "Review omits internal protocol identifiers");
            }
        }
    }
    private void collect(View view, java.util.List<View> views) { views.add(view); if (view instanceof ViewGroup group) for (int i = 0; i < group.getChildCount(); i++) collect(group.getChildAt(i), views); }
    void run() throws Exception {
        for (String method : List.of("tap", "node.click", "longPress", "swipe", "pinch", "type", "key", "back", "app.launch")) {
            openFixture();
            Thread.sleep(700);
            JSONObject observation = stableObservation();
            JSONObject params = parameters(method, observation);
            if (method.equals("app.launch")) {
                try (android.os.ParcelFileDescriptor descriptor = test.getUiAutomation(android.app.UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES).executeShellCommand("input keyevent KEYCODE_HOME")) {
                    new java.io.FileInputStream(descriptor.getFileDescriptor()).readNBytes(4096);
                }
                Thread.sleep(400);
            }
            CompletableFuture<JSONObject> response = request(method.equals("back") ? "key" : method, params);
            awaitConsent();
            if (method.equals("tap")) test.require(new JSONObject(service.consent.parameters).getLong("deadlineAt") == params.getLong("deadlineAt"),
                    "The complete deadline envelope stays bound to biometric review before action-only dispatch validation");
            clickReview("Confirm this action with biometrics");
            Bundle ready = new Bundle(); ready.putString("stream", "PHONE_BIOMETRIC_READY " + method + "\n"); test.sendStatus(2, ready);
            JSONObject result = response.get(35, TimeUnit.SECONDS);
            test.require(result.optJSONObject("result") != null, method + " dispatch failed: " + test.error(result) + (result.optJSONObject("error") == null ? "" : ": " + result.optJSONObject("error").optString("message")));
            Thread.sleep(400);
            if (List.of("key", "back", "app.launch").contains(method)) {
                String expectedPackage = fixture;
                if (!method.equals("app.launch")) {
                    android.content.pm.ResolveInfo launcher = test.getTargetContext().getPackageManager().resolveActivity(
                            new android.content.Intent(android.content.Intent.ACTION_MAIN).addCategory(android.content.Intent.CATEGORY_HOME),
                            android.content.pm.PackageManager.ResolveInfoFlags.of(android.content.pm.PackageManager.MATCH_DEFAULT_ONLY));
                    expectedPackage = launcher == null || launcher.activityInfo == null ? null : launcher.activityInfo.packageName;
                }
                // Dispatch acceptance precedes window presentation. Observe the
                // actual destination within a bound; never repeat the action.
                test.require(expectedPackage != null && waitForPackage(expectedPackage), method + " changed actual foreground as expected");
            }
            if (method.equals("tap") || method.equals("node.click")) {
                JSONObject after = stableObservation();
                int beforeCount = Integer.parseInt(node(observation, "Counter:").getString("text").substring(9));
                int afterCount = Integer.parseInt(node(after, "Counter:").getString("text").substring(9));
                test.require(afterCount == (beforeCount + 1) % 1000, method + " changed exactly one fixture count");
            }
            if (method.equals("type")) {
                java.util.List<android.view.accessibility.AccessibilityNodeInfo> inputs = test.getUiAutomation(android.app.UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES)
                        .getRootInActiveWindow().findAccessibilityNodeInfosByText("Emulated biometric typing verified");
                test.require(inputs.size() == 1 && inputs.get(0).isEditable(), "Type replaced the fixture input value");
            }
            if (List.of("longPress", "swipe", "pinch").contains(method)) {
                JSONObject after = stableObservation();
                String summary = node(after, "Pad:").getString("text");
                if (method.equals("longPress")) test.require(!summary.endsWith("long 0"), "Long press reached fixture pad");
                if (method.equals("swipe")) test.require(!summary.contains("moves 0;"), "Swipe moved on fixture pad");
                if (method.equals("pinch")) test.require(summary.contains("pointers 2"), "Pinch delivered two simultaneous pointers");
            }
        }
        test.launch(fixture + "/io.github.quintond.orchestrator.phonefixture.FixtureActivity"); Thread.sleep(600);
        java.util.List<android.view.accessibility.AccessibilityNodeInfo> scheduled = test.getUiAutomation(android.app.UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES)
                .getRootInActiveWindow().findAccessibilityNodeInfosByText("Change counter in two seconds");
        test.require(scheduled.size() == 1 && scheduled.get(0).performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_CLICK), "Scheduled fixture change available");
        JSONObject staleObservation = stableObservation();
        CompletableFuture<JSONObject> stale = request("tap", parameters("tap", staleObservation));
        awaitConsent(); Thread.sleep(2200); clickReview("Confirm this action with biometrics");
        Bundle staleReady = new Bundle(); staleReady.putString("stream", "PHONE_BIOMETRIC_READY stale-content\n"); test.sendStatus(2, staleReady);
        test.require(test.error(stale.get(35, TimeUnit.SECONDS)).equals("stale_observation"), "Changed content during biometric review is rejected");
        Thread.sleep(700);
        android.view.accessibility.AccessibilityNodeInfo semanticRoot = test.getUiAutomation(android.app.UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES).getRootInActiveWindow();
        java.util.List<android.view.accessibility.AccessibilityNodeInfo> checkbox = semanticRoot.findAccessibilityNodeInfosByText("Semantic checkbox");
        java.util.List<android.view.accessibility.AccessibilityNodeInfo> toggle = semanticRoot.findAccessibilityNodeInfosByText("Toggle checkbox in two seconds");
        test.require(checkbox.size() == 1 && !checkbox.get(0).isChecked() && toggle.size() == 1 && toggle.get(0).performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_CLICK),
                "Schedule a checkbox-only state change while its label and geometry stay unchanged");
        JSONObject semanticObservation = stableObservation();
        CompletableFuture<JSONObject> semantic = request("tap", parameters("tap", semanticObservation));
        awaitConsent(); Thread.sleep(2200); clickReview("Confirm this action with biometrics");
        Bundle semanticReady = new Bundle(); semanticReady.putString("stream", "PHONE_BIOMETRIC_READY stale-semantic\n"); test.sendStatus(2, semanticReady);
        test.require(test.error(semantic.get(35, TimeUnit.SECONDS)).equals("stale_observation"), "Changed checkbox state during biometric review is rejected");
        Thread.sleep(700);
        checkbox = test.getUiAutomation(android.app.UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES).getRootInActiveWindow().findAccessibilityNodeInfosByText("Semantic checkbox");
        test.require(checkbox.size() == 1 && checkbox.get(0).isChecked(), "Independent fixture checkbox postcondition confirms the semantic change occurred");
        JSONObject observed = stableObservation();
        CompletableFuture<JSONObject> denied = request("tap", parameters("tap", observed));
        awaitConsent(); clickReview("Deny action");
        test.require(test.error(denied.get(5, TimeUnit.SECONDS)).equals("consent_denied"), "Local denial dispatches nothing");
        Thread.sleep(700);
        observed = stableObservation();
        JSONObject expired = parameters("tap", observed); expired.put("deadlineAt", System.currentTimeMillis() + 1200);
        CompletableFuture<JSONObject> timeout = request("tap", expired);
        awaitConsent();
        test.require(test.error(timeout.get(5, TimeUnit.SECONDS)).equals("consent_denied"), "Deadline cancels unapproved handoff");
        test.require(service.consent == null, "Timed-out handoff removed");
        Thread.sleep(700);
        observed = stableObservation();
        CompletableFuture<JSONObject> stopped = request("tap", parameters("tap", observed));
        awaitConsent();
        JSONObject stop = test.call("stop", Json.object());
        test.require(stop.optJSONObject("result") != null, "Stop remains available during consent");
        test.require(test.error(stopped.get(5, TimeUnit.SECONDS)).equals("consent_denied"), "Stop cancels pending general action");
        test.require(service.consent == null && service.pairingToken() == null, "Stop revokes pending consent and token");
    }
    private JSONObject parameters(String method, JSONObject observation) throws Exception {
        JSONObject result = test.bound(observation);
        double x = 0, y = 0;
        // Each action requires only its own visible target. In landscape the pad
        // can be offscreen while the editable field remains available for review.
        if (List.of("tap", "longPress", "swipe", "pinch").contains(method)) {
            JSONObject bounds = node(observation, method.equals("tap") ? "Increment harmless counter" : "Gesture test pad").getJSONObject("bounds");
            x = (bounds.getInt("left") + bounds.getInt("right")) / 2.0;
            y = (bounds.getInt("top") + bounds.getInt("bottom")) / 2.0;
        }
        switch (method) {
            case "tap", "longPress" -> { result.put("x", x).put("y", y); if (method.equals("longPress")) result.put("durationMs", 650); }
            case "node.click" -> result.put("nodeId", node(observation, "Increment harmless counter").getString("id"));
            case "swipe" -> result.put("points", new JSONArray(List.of(Json.object("x", x - 80, "y", y), Json.object("x", x + 80, "y", y)))).put("durationMs", 400);
            case "pinch" -> result.put("centerX", x).put("centerY", y).put("scale", 1.5).put("durationMs", 400);
            case "type" -> {
                JSONArray nodes = observation.getJSONArray("nodes");
                for (int i = 0; i < nodes.length(); i++) if (nodes.getJSONObject(i).getBoolean("editable")) { result.put("nodeId", nodes.getJSONObject(i).getString("id")).put("text", "Emulated biometric typing verified"); break; }
            }
            case "key" -> result.put("key", "home");
            case "back" -> result.put("key", "back");
            case "app.launch" -> { result.remove("observationId"); result.put("packageName", fixture); }
            default -> throw new AssertionError(method);
        }
        return result;
    }
    private void openFixture() {
        test.getTargetContext().startActivity(new android.content.Intent().setComponent(android.content.ComponentName.unflattenFromString(fixture + "/io.github.quintond.orchestrator.phonefixture.FixtureActivity"))
                .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK | android.content.Intent.FLAG_ACTIVITY_CLEAR_TASK));
    }
    private JSONObject stableObservation() throws Exception {
        int sequence = ++readinessSequence;
        if (sequence > 64) throw new AssertionError("Read-only readiness sequence limit exceeded");
        String code = "unavailable";
        String stage = "none";
        long elapsed = 0;
        int refused = 0;
        for (int attempt = 0; attempt < 8; attempt++) {
            stage = "none"; elapsed = 0;
            try {
                JSONObject response = test.call("observe", test.scope(false));
                JSONObject result = response.optJSONObject("result");
                if (result != null && !result.has("blockedReason")) {
                    readiness("PHONE_READINESS_RESULT " + sequence + " ready " + refused);
                    return result;
                }
                code = readinessCode(result == null ? test.error(response) : result.optString("blockedReason"));
                JSONObject diagnostic = result == null ? response.getJSONObject("error").optJSONObject("details") : result;
                if (diagnostic != null) {
                    String candidate = diagnostic.optString("captureStage", "none");
                    stage = List.of("queued", "awaiting_callback", "encoding").contains(candidate) ? candidate : "none";
                    elapsed = Math.max(0, Math.min(60000, diagnostic.optLong("captureElapsedMs", 0)));
                }
            } catch (Exception readFailed) {
                code = "read_error";
            }
            refused++;
            readiness("PHONE_READINESS_REFUSED " + sequence + " " + refused + " " + code + " " + stage + " " + elapsed);
            // Test-only readiness. Each refused read remains evidence, and no
            // mutation is retried or authorized from a refused observation.
            if (!List.of("stale_observation", "window_unavailable", "screenshot_unavailable", "protected_window", "screenshot_geometry_changed").contains(code)) break;
            try { Thread.sleep(250); }
            catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); break; }
        }
        readiness("PHONE_READINESS_RESULT " + sequence + " failed " + refused);
        throw new AssertionError("No stable read-only observation: " + code + "; captureStage=" + stage + "; captureElapsedMs=" + elapsed);
    }
    private String readinessCode(String code) {
        return CaptureDiagnostics.known(code) || List.of("stale_observation", "window_unavailable", "screenshot_unavailable", "protected_window",
                "sensitive_window", "tree_too_large", "forbidden", "unauthorized", "session_expired", "protected_app", "app_unavailable").contains(code) ? code : "other";
    }
    private void readiness(String message) {
        Bundle status = new Bundle(); status.putString("stream", message + "\n"); test.sendStatus(3, status);
    }
    private JSONObject node(JSONObject observation, String prefix) throws Exception {
        JSONArray nodes = observation.getJSONArray("nodes");
        for (int i = 0; i < nodes.length(); i++) if (nodes.getJSONObject(i).optString("text").startsWith(prefix)) return nodes.getJSONObject(i);
        throw new AssertionError("Missing fixture node " + prefix);
    }
    private CompletableFuture<JSONObject> request(String method, JSONObject params) {
        return CompletableFuture.supplyAsync(() -> { try { return test.call(method, params); } catch (Exception error) { throw new RuntimeException(error); } });
    }
    private void awaitConsent() throws Exception {
        awaitConsent(null);
    }
    private void awaitConsent(CompletableFuture<JSONObject> response) throws Exception {
        long deadline = System.currentTimeMillis() + 6000;
        while (System.currentTimeMillis() < deadline) {
            if (service.consent != null && service.consent.activity != null) { Thread.sleep(300); return; }
            if (response != null && response.isDone()) throw new AssertionError("Native consent Activity did not appear: " + test.error(response.get()));
            Thread.sleep(50);
        }
        throw new AssertionError("Native consent Activity did not appear");
    }
    private void clickReview(String label) {
        test.runOnMainSync(() -> {
            ConsentActivity.Pending pending = service.consent;
            test.require(pending != null && pending.activity != null && findButton(pending.activity.getWindow().getDecorView(), label), "Local review control available");
        });
    }
    private boolean findButton(View view, String label) {
        if (view instanceof Button button && label.equalsIgnoreCase(button.getText().toString())) return button.performClick();
        if (view instanceof ViewGroup group) for (int i = 0; i < group.getChildCount(); i++) if (findButton(group.getChildAt(i), label)) return true;
        return false;
    }
}
