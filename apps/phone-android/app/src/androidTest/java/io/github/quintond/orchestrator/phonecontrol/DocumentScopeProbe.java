// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
package io.github.quintond.orchestrator.phonecontrol;

import android.os.Bundle;
import android.os.SystemClock;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

/** Uses a real owner picker grant. Never seeds production grant preferences or bypasses biometrics. */
final class DocumentScopeProbe {
    private final SmokeTest test;
    private final PhoneService service;
    private final String id;
    DocumentScopeProbe(SmokeTest test, PhoneService service, String id) { this.test = test; this.service = service; this.id = id; }
    void run(boolean readOnly) throws Exception {
        if (readOnly) { readOnly(); return; }
        DocumentPolicy documents = new DocumentPolicy(service);
        DocumentPolicy.Grant grant = documents.require(id, true);
        test.require(grant.provider.equals("io.github.quintond.orchestrator.phonefixture.debug")
                && grant.uri.toString().equals("content://io.github.quintond.orchestrator.phonefixture.debug.documents/document/target"), "Only exact synthetic owner-selected fixture target may be modified");
        test.require(service.biometricAvailable(), "Emulator strong biometric must be enrolled");
        JSONObject described = test.call("describe", Json.object()).getJSONObject("result");
        test.require(!described.has("documentResources") && !described.toString().contains(id), "Generic describe does not disclose document inventory");
        JSONObject before = read();
        String original = before.getString("text");
        test.require(before.getString("resourceId").equals(id) && before.getString("revision").equals(Policy.digest(original)), "Exact UTF-8 document read and revision");
        test.require(test.error(test.call("document.read", Json.object("resourceId", id, "uri", grant.uri.toString()))).equals("invalid_request"), "Caller URI parameters are rejected");
        test.require(test.error(test.call("document.read", Json.object("resourceId", "00000000-0000-4000-8000-000000000000"))).equals("forbidden"), "Guessed same-provider handle has no authority");
        test.require(test.error(test.call("document.replace", parameters("0".repeat(64), "never write"))).equals("stale_document"), "Stale revision rejected before consent");
        test.require(service.consent == null, "Stale revision opens no biometric review");
        CompletableFuture<JSONObject> denied = request(parameters(before.getString("revision"), "denied replacement"));
        awaitConsent(denied); click("Deny action");
        test.require(test.error(denied.get(5, TimeUnit.SECONDS)).equals("consent_denied"), "Owner denial is definite before write");
        test.require(read().getString("text").equals(original), "Denial preserves exact document content");
        String replacement = "Scoped document QA\r\nKeep café and 日本語.\nOne exact owner-reviewed replacement.\n";
        CompletableFuture<JSONObject> action = request(parameters(before.getString("revision"), replacement));
        awaitConsent(action);
        test.require(service.consent.review.contains(original) && service.consent.review.contains(replacement)
                && service.consent.parameters.contains(id), "Review displays complete old/new text and binds the exact resource");
        click("Confirm this action with biometrics");
        Bundle ready = new Bundle(); ready.putString("stream", "PHONE_DOCUMENT_SCOPE_BIOMETRIC_READY replace\n"); test.sendStatus(2, ready);
        JSONObject receipt = action.get(44, TimeUnit.SECONDS);
        test.require(receipt.optJSONObject("result") != null && receipt.getJSONObject("result").getString("status").equals("completed"), "Real CryptoObject-authorized replacement completed: " + test.error(receipt));
        JSONObject after = read();
        test.require(after.getString("text").equals(replacement) && after.getString("revision").equals(Policy.digest(replacement)), "Independent fresh native read verifies replacement");
        android.os.ParcelFileDescriptor ownerVerifier = service.getContentResolver().openFileDescriptor(grant.uri, "r");
        test.require(ownerVerifier != null, "Independent owner verifier opened before revocation");
        try (android.os.ParcelFileDescriptor.AutoCloseInputStream verify = new android.os.ParcelFileDescriptor.AutoCloseInputStream(ownerVerifier)) {
        CompletableFuture<JSONObject> revoked = request(parameters(after.getString("revision"), "revoked replacement"));
        awaitConsent(revoked);
        long stopped = SystemClock.elapsedRealtime();
        test.runOnMainSync(() -> {
            service.stopSession("Owner revokes synthetic document in QA");
            try { documents.revoke(id); } catch (ApiException failure) { throw new IllegalStateException(failure); }
        });
        test.require(SystemClock.elapsedRealtime() - stopped < 1000 && service.pairingToken() == null, "Owner Stop/revoke remains responsive during document consent");
        revoked.get(5, TimeUnit.SECONDS);
        test.require(documents.grants().stream().noneMatch(value -> value.resourceId.equals(id)), "Revocation removes exact local document authority");
        test.require(DocumentText.read(verify).equals(replacement), "Independent already-open owner descriptor proves revoked replacement did not write");
        }
    }
    private void readOnly() throws Exception {
        DocumentPolicy documents = new DocumentPolicy(service);
        DocumentPolicy.Grant grant = documents.require(id, false);
        test.require(grant.provider.equals("io.github.quintond.orchestrator.phonefixture.debug")
                && grant.uri.toString().equals("content://io.github.quintond.orchestrator.phonefixture.debug.documents/document/target"), "Only exact synthetic owner-selected fixture target is supported");
        test.require(!grant.write, "Owner picker grant must be read-only");
        JSONObject described = test.call("describe", Json.object()).getJSONObject("result");
        test.require(!described.has("documentResources") && !described.toString().contains(id), "Generic describe withholds read-only document inventory");
        JSONObject before = read();
        String original = before.getString("text");
        test.require(before.getString("resourceId").equals(id) && before.getString("revision").equals(Policy.digest(original)), "Read-only grant allows exact document read/revision");
        JSONObject denied = test.call("document.replace", parameters(before.getString("revision"), "Never authorize this read-only replacement"));
        test.require(test.error(denied).equals("forbidden"), "Local read-only grant forbids replacement even with the operation enabled");
        test.require(service.consent == null, "Read-only replacement rejection opens no biometric review");
        test.require(read().getString("text").equals(original), "Rejected read-only replacement preserves exact document bytes");
        long stopped = SystemClock.elapsedRealtime();
        test.runOnMainSync(() -> {
            service.stopSession("Owner revokes synthetic read-only document in QA");
            try { documents.revoke(id); } catch (ApiException failure) { throw new IllegalStateException(failure); }
        });
        test.require(SystemClock.elapsedRealtime() - stopped < 1000 && service.pairingToken() == null, "Read-only owner Stop/revoke is responsive");
        test.require(documents.grants().stream().noneMatch(value -> value.resourceId.equals(id)), "Read-only revocation removes exact local authority");
    }
    private JSONObject read() throws Exception { return test.call("document.read", Json.object("resourceId", id)).getJSONObject("result"); }
    private JSONObject parameters(String revision, String text) {
        return Json.object("resourceId", id, "expectedRevision", revision, "text", text, "deadlineAt", System.currentTimeMillis() + 45_000);
    }
    private CompletableFuture<JSONObject> request(JSONObject parameters) {
        return CompletableFuture.supplyAsync(() -> { try { return test.call("document.replace", parameters); } catch (Exception failure) { throw new IllegalStateException(failure); } });
    }
    private void awaitConsent(CompletableFuture<JSONObject> response) throws Exception {
        long until = SystemClock.elapsedRealtime() + 6000;
        while (SystemClock.elapsedRealtime() < until) {
            if (service.consent != null && service.consent.activity != null) { Thread.sleep(200); return; }
            if (response.isDone()) throw new AssertionError("Document consent did not open: " + test.error(response.get()));
            Thread.sleep(40);
        }
        throw new AssertionError("Document consent did not open within six seconds");
    }
    private void click(String label) {
        test.runOnMainSync(() -> { test.require(service.consent != null && service.consent.activity != null
                && find(service.consent.activity.getWindow().getDecorView(), label), "Real local review control available"); });
    }
    private boolean find(View view, String label) {
        if (view instanceof Button button && label.equalsIgnoreCase(button.getText().toString())) return button.performClick();
        if (view instanceof ViewGroup group) for (int index = 0; index < group.getChildCount(); index++) if (find(group.getChildAt(index), label)) return true;
        return false;
    }
}
