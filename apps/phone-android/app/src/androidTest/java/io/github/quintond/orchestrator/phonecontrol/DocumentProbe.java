// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
package io.github.quintond.orchestrator.phonecontrol;

import android.app.UiAutomation;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import org.json.JSONArray;
import org.json.JSONObject;
import java.security.MessageDigest;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

/** Scripted real-editor QA. Owner setup/navigation is never presented as an agent action. */
final class DocumentProbe {
    static final String APP = "net.gsantner.markor";
    private static final String SIGNER = "57d106d0cfa8763442b3645ef2741c38bb820bd56fd4612bf40a23b6d998be5e";
    private static final String EDITOR = APP + ":id/document__fragment__edit__highlighting_editor";
    private final SmokeTest test;
    private final PhoneService service;
    private final String run;
    private final int seed;

    DocumentProbe(SmokeTest test, PhoneService service, String run, int seed) {
        this.test = test; this.service = service; this.run = run; this.seed = seed;
    }

    void run() throws Exception {
        test.require(test.getTargetContext().getPackageName().endsWith(".debug") && run.matches("[a-f0-9]{32}") && Set.of(17, 29, 43).contains(seed), "Bounded document case");
        // Independent installed-package pin; local policy still performs its own checks.
        android.content.pm.PackageInfo app = service.getPackageManager().getPackageInfo(APP, PackageManager.PackageInfoFlags.of(PackageManager.GET_SIGNING_CERTIFICATES));
        test.require(app.getLongVersionCode() == 163 && app.signingInfo != null && app.signingInfo.getApkContentsSigners().length == 1, "Pinned editor version");
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(app.signingInfo.getApkContentsSigners()[0].toByteArray());
        StringBuilder encoded = new StringBuilder(); for (byte value : digest) encoded.append(String.format(java.util.Locale.ROOT, "%02x", value & 255));
        test.require(SIGNER.contentEquals(encoded), "Pinned editor certificate");
        test.require(service.biometricAvailable(), "Strong emulator fingerprint is required");
        openDocument(); Thread.sleep(1800);
        JSONObject before = observe();
        title(before);
        JSONObject editor = editor(before);
        test.require(editor.optBoolean("enabled") && editor.optBoolean("editable") && !editor.has("text"), "Native editable identity is exposed with value withheld");
        JSONObject type = bound(before).put("nodeId", editor.getString("id")).put("text", text());
        test.require(action("type", type, "type").equals("none"), "Reviewed document type completed");
        Thread.sleep(900);
        JSONObject changed = observe(); editor(changed);
        // V2 accepts exactly type then Home. Any refusal fails the case; a fresh
        // observation cannot conceal an unsuccessful navigation or add a retry.
        test.require(action("key", bound(changed).put("key", "home"), "home").equals("none"), "Reviewed document navigation completed without recovery");
        Thread.sleep(600);
        android.content.pm.ResolveInfo home = service.getPackageManager().resolveActivity(new android.content.Intent(android.content.Intent.ACTION_MAIN)
                .addCategory(android.content.Intent.CATEGORY_HOME), android.content.pm.PackageManager.ResolveInfoFlags.of(android.content.pm.PackageManager.MATCH_DEFAULT_ONLY));
        test.require(home != null && home.activityInfo != null && !APP.equals(home.activityInfo.packageName), "Owner resolved launcher identity");
        android.view.accessibility.AccessibilityNodeInfo root = test.getUiAutomation(UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES).getRootInActiveWindow();
        test.require(root != null && home.activityInfo.packageName.contentEquals(root.getPackageName()), "Companion Home reached resolved launcher");
        event(Json.object("kind", "home", "resolvedLauncherVisible", true));
        // Restart/reopen is owner verifier setup with a fixed synthetic URI. It
        // never counts as a companion action or source-runtime capability.
        shell("am force-stop " + APP, 0);
        test.require(shell("pidof " + APP, 1).isBlank(), "Owner verified editor process absent before reopen");
        openDocument(); Thread.sleep(1600);
        JSONObject reopened = observe(); editor(reopened); title(reopened);
        event(Json.object("kind", "reopen", "ownerDriven", true, "editorVisible", true));
    }

    private String text() {
        String original = switch (seed) {
            case 17 -> "# Emulator notes\n\nKeep the grocery list.\n";
            case 29 -> "# Emulator notes\n\nKeep café and 日本語 exactly.\n";
            case 43 -> "# Emulator notes\r\n\r\nKeep the last line without a newline";
            default -> throw new AssertionError("Invalid document seed");
        };
        return original + "\n\nChecked item " + seed + ": local emulator task completed.\n";
    }

    private void openDocument() throws Exception {
        shell("am start -W -a android.intent.action.EDIT -d file:///sdcard/Download/phone-document-qa-" + run + "/target" + seed
                + ".txt -t text/plain -n " + APP + "/.activity.DocumentActivity", 0);
    }
    private String shell(String command, int expectedExit) throws Exception {
        // UiAutomation Runtime.exec does not interpret shell syntax. Feed these
        // fixed owner commands to sh's stdin and require its terminal status.
        android.os.ParcelFileDescriptor[] pipes = test.getUiAutomation(UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES).executeShellCommandRw("sh");
        try (android.os.ParcelFileDescriptor.AutoCloseInputStream output = new android.os.ParcelFileDescriptor.AutoCloseInputStream(pipes[0])) {
            try (android.os.ParcelFileDescriptor.AutoCloseOutputStream input = new android.os.ParcelFileDescriptor.AutoCloseOutputStream(pipes[1])) {
                input.write((command + "\necho PHONE_DOCUMENT_SHELL_EXIT_$?\n").getBytes(java.nio.charset.StandardCharsets.UTF_8));
            }
            byte[] bytes = output.readNBytes(4097);
            test.require(bytes.length <= 4096, "Owner setup command output bound");
            String value = new String(bytes, java.nio.charset.StandardCharsets.UTF_8);
            String marker = "PHONE_DOCUMENT_SHELL_EXIT_" + expectedExit;
            test.require(value.endsWith(marker + "\n") && value.indexOf("PHONE_DOCUMENT_SHELL_EXIT_") == value.lastIndexOf("PHONE_DOCUMENT_SHELL_EXIT_"), "Owner setup command exact exit status");
            return value.substring(0, value.lastIndexOf(marker)).trim();
        }
    }
    private JSONObject bound(JSONObject observation) throws Exception {
        return Json.object("observationId", observation.getString("observationId"), "expectedPackage", APP, "deadlineAt", System.currentTimeMillis() + 30_000);
    }
    private JSONObject observe() throws Exception {
        long started = SystemClock.elapsedRealtime();
        JSONObject response;
        try { response = test.call("observe", Json.object("allowedPackages", new JSONArray(List.of(APP)), "includeScreenshot", false)); }
        catch (Exception failed) {
            event(Json.object("kind", "observation", "success", false, "elapsedMs", SystemClock.elapsedRealtime() - started, "code", "transport_error"));
            throw new AssertionError("Document observation transport failed");
        }
        JSONObject result = response.optJSONObject("result");
        String code = result == null ? test.error(response) : result.optString("blockedReason", "none");
        event(Json.object("kind", "observation", "success", code.equals("none"), "elapsedMs", SystemClock.elapsedRealtime() - started, "code", code));
        test.require(code.equals("none"), "Document observation refused: " + code);
        test.require(APP.equals(result.getString("packageName")), "Observation belongs to pinned editor");
        return result;
    }
    private JSONObject editor(JSONObject observation) throws Exception {
        JSONArray nodes = observation.getJSONArray("nodes"); JSONObject found = null;
        for (int i = 0; i < nodes.length(); i++) {
            JSONObject node = nodes.getJSONObject(i);
            if (EDITOR.equals(node.optString("resourceId"))) { test.require(found == null, "Editor resource is unique"); found = node; }
        }
        test.require(found != null && found.optBoolean("editable"), "Pinned editor node is accessible");
        return found;
    }
    private void title(JSONObject observation) throws Exception {
        JSONArray nodes = observation.getJSONArray("nodes"); boolean found = false;
        for (int i = 0; i < nodes.length(); i++) {
            String value = nodes.getJSONObject(i).optString("text");
            if (value.equals("target" + seed) || value.equals("target" + seed + ".txt")) found = true;
        }
        test.require(found, "Exact seeded document title is visible");
    }
    private String action(String method, JSONObject params, String marker) throws Exception {
        java.util.Map<String, java.util.Map<String, String>> before = diagnosticState();
        long started = SystemClock.elapsedRealtime();
        long consentStarted = 0;
        java.util.concurrent.atomic.AtomicLong consentCompleted = new java.util.concurrent.atomic.AtomicLong();
        String code = "transport_error";
        String stage = "transport";
        CompletableFuture<JSONObject> response = CompletableFuture.supplyAsync(() -> {
            try { return test.call(method, params); } catch (Exception failed) { throw new IllegalStateException("Document transport failed"); }
        });
        try {
            long deadline = started + 6000;
            while (service.consent == null || service.consent.activity == null) {
                if (response.isDone()) { JSONObject early = response.get(); code = test.error(early); stage = failureStage(early); if (code.equals("none")) code = "unreviewed_result"; return code; }
                if (SystemClock.elapsedRealtime() >= deadline) throw new AssertionError("Document consent surface deadline");
                Thread.sleep(50);
            }
            consentStarted = SystemClock.elapsedRealtime();
            ConsentActivity.Pending approval = service.consent;
            approval.result.whenComplete((accepted, failed) -> consentCompleted.compareAndSet(0, SystemClock.elapsedRealtime()));
            Thread.sleep(300);
            test.runOnMainSync(() -> test.require(service.consent != null && service.consent.activity != null
                    && confirm(service.consent.activity.getWindow().getDecorView()), "Native document review control"));
            Bundle ready = new Bundle(); ready.putString("stream", "PHONE_DOCUMENT_V2_READY " + marker + "\n"); test.sendStatus(2, ready);
            JSONObject result = response.get(35, TimeUnit.SECONDS);
            code = result.optJSONObject("result") != null ? "none" : test.error(result);
            stage = code.equals("none") ? "none" : failureStage(result);
            return code;
        } finally {
            long elapsed = SystemClock.elapsedRealtime();
            long consentEnd = consentCompleted.get() == 0 ? elapsed : consentCompleted.get();
            JSONArray changed = code.equals("stale_observation") ? changedFields(before, diagnosticState()) : new JSONArray();
            event(Json.object("kind", "action", "method", method, "success", code.equals("none"), "elapsedMs", elapsed - started, "consentMs", consentStarted == 0 ? 0 : Math.max(0, consentEnd - consentStarted), "code", code, "stage", stage, "changedFields", changed));
        }
    }
    private java.util.Map<String, java.util.Map<String, String>> diagnosticState() {
        java.util.concurrent.atomic.AtomicReference<java.util.Map<String, java.util.Map<String, String>>> result = new java.util.concurrent.atomic.AtomicReference<>();
        test.runOnMainSync(() -> {
            try {
                Observation observed = Observation.capture(service, Set.of(APP));
                java.util.Map<String, java.util.Map<String, String>> nodes = new java.util.HashMap<>();
                for (java.util.Map.Entry<String, android.view.accessibility.AccessibilityNodeInfo> entry : observed.references.entrySet()) {
                    android.view.accessibility.AccessibilityNodeInfo node = entry.getValue(); android.graphics.Rect bounds = new android.graphics.Rect(); node.getBoundsInScreen(bounds);
                    java.util.Map<String, String> state = new java.util.HashMap<>();
                    state.put("editor", String.valueOf(EDITOR.equals(node.getViewIdResourceName())));
                    state.put("bounds", bounds.toString()); state.put("actions", NodeSemantics.actions(node).toString());
                    state.put("selected", String.valueOf(node.isSelected())); state.put("checked", String.valueOf(node.isChecked()));
                    state.put("enabled", String.valueOf(node.isEnabled())); state.put("editable", String.valueOf(node.isEditable())); state.put("scrollable", String.valueOf(node.isScrollable()));
                    state.put("text", String.valueOf(node.getText())); state.put("description", String.valueOf(node.getContentDescription()));
                    state.put("selection", node.getTextSelectionStart() + "," + node.getTextSelectionEnd());
                    state.put("state", String.valueOf(node.getStateDescription()));
                    state.put("identity", node.getClassName() + ":" + node.getViewIdResourceName());
                    nodes.put(entry.getKey(), state);
                }
                result.set(nodes);
            } catch (ApiException unavailable) { /* Safe diagnostic availability only. */ }
        });
        return result.get();
    }
    private JSONArray changedFields(java.util.Map<String, java.util.Map<String, String>> before, java.util.Map<String, java.util.Map<String, String>> after) {
        java.util.Set<String> changed = new java.util.TreeSet<>();
        if (before == null || after == null) changed.add("unavailable");
        else {
            if (!before.keySet().equals(after.keySet())) changed.add("tree_shape");
            for (java.util.Map.Entry<String, java.util.Map<String, String>> entry : before.entrySet()) {
                java.util.Map<String, String> current = after.get(entry.getKey());
                if (current == null) continue;
                for (String field : List.of("bounds", "actions", "selected", "checked", "enabled", "editable", "scrollable", "text", "description", "selection", "state", "identity")) {
                    if (!java.util.Objects.equals(entry.getValue().get(field), current.get(field)))
                        changed.add((entry.getValue().get("editor").equals("true") ? "editor_" : "other_") + field);
                }
            }
        }
        return new JSONArray(changed);
    }
    private String failureStage(JSONObject response) {
        JSONObject error = response.optJSONObject("error");
        String message = error == null ? "" : error.optString("message");
        if (message.equals("Original window did not return after consent")) return "restore_timeout";
        if (message.equals("Target changed immediately before execution")) return "predispatch_changed";
        if (message.equals("Window changed since observation")) return "preconsent_changed";
        if (message.startsWith("Window changed during consent:")) return "consent_context_changed";
        if (message.equals("Observation expired during consent")) return "observation_expired";
        return "other";
    }
    private boolean confirm(View view) {
        if (view instanceof Button button && "Confirm this action with biometrics".equalsIgnoreCase(button.getText().toString())) return button.performClick();
        if (view instanceof ViewGroup group) for (int i = 0; i < group.getChildCount(); i++) if (confirm(group.getChildAt(i))) return true;
        return false;
    }
    private void event(JSONObject value) {
        Bundle progress = new Bundle(); progress.putString("stream", "PHONE_DOCUMENT_V2_EVENT " + value + "\n"); test.sendStatus(3, progress);
    }
}
