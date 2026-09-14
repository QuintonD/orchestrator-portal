// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
package io.github.quintond.orchestrator.phonecontrol;

import android.os.Bundle;
import android.os.SystemClock;
import android.provider.DocumentsContract;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

/** Real picker authority and real CryptoObject consent; synthetic emulator only. */
final class FolderScopeProbe {
    private final SmokeTest test;
    private final PhoneService service;
    private final String id;
    FolderScopeProbe(SmokeTest test, PhoneService service, String id) { this.test = test; this.service = service; this.id = id; }
    void run(String mode) throws Exception {
        FolderPolicy folders = new FolderPolicy(service);
        FolderPolicy.Grant grant = folders.require(id, true);
        String expectedFolder = mode.equals("folder-alias") ? "alias" : mode.equals("folder-alias-new") ? "alias-new" : "drafts";
        test.require(grant.provider.equals("io.github.quintond.orchestrator.phonefixture.debug")
                && grant.uri.toString().equals("content://io.github.quintond.orchestrator.phonefixture.debug.documents/tree/" + expectedFolder),
                "Only synthetic owner-picked draft fixture folder may be used");
        test.require(service.biometricAvailable(), "Strong emulator biometric enrolled");
        JSONObject described = test.call("describe", Json.object()).getJSONObject("result");
        test.require(!described.toString().contains(id), "Generic describe never discloses folder inventory");
        String target = readExisting(grant, "target"), sibling = readExisting(grant, "sibling");
        test.require(test.error(test.call("document.read", Json.object("resourceId", id))).equals("forbidden"), "Folder handle cannot read existing documents");
        test.require(test.error(test.call("document.replace", Json.object("resourceId", id, "expectedRevision", "0".repeat(64), "text", "forbidden", "deadlineAt", System.currentTimeMillis() + 45000))).equals("forbidden"), "Folder handle cannot replace documents");
        test.require(test.error(test.call("draft.create", Json.object("resourceId", id, "text", "never", "filename", "target.txt", "deadlineAt", System.currentTimeMillis() + 45000))).equals("invalid_request"), "Caller filenames fail before review");
        test.require(test.error(test.call("draft.create", parameters("00000000-0000-4000-8000-000000000000", "never"))).equals("forbidden"), "Guessed resource has no authority");
        CompletableFuture<JSONObject> denied = request("denied draft");
        awaitConsent(denied); click("Deny action");
        test.require(test.error(denied.get(5, TimeUnit.SECONDS)).equals("consent_denied"), "Denial has a definite no-create outcome");
        test.require(readExisting(grant, "target").equals(target) && readExisting(grant, "sibling").equals(sibling), "Denial preserves existing text");
        String text = "Synthetic folder draft QA\r\nComplete owner-reviewed draft.\n";
        CompletableFuture<JSONObject> action = request(text);
        awaitConsent(action);
        test.require(service.consent.review.contains(text) && service.consent.review.contains(grant.name)
                && service.consent.review.contains(grant.provider) && service.consent.review.contains(".draft.txt"), "Complete text folder provider and generated filename reviewed");
        click("Confirm this action with biometrics");
        Bundle ready = new Bundle(); ready.putString("stream", "PHONE_FOLDER_SCOPE_BIOMETRIC_READY create\n"); test.sendStatus(2, ready);
        JSONObject receipt = action.get(44, TimeUnit.SECONDS);
        if (!mode.equals("folder-full")) {
            test.require(test.error(receipt).equals("unknown_action_state"), "Malicious create alias rejected with unknown receipt after create attempt");
            test.require(readExisting(grant, "target").equals(target) && readExisting(grant, "sibling").equals(sibling), "Malicious alias neither truncates nor writes existing files");
        } else {
            test.require(receipt.optJSONObject("result") != null && receipt.getJSONObject("result").getString("status").equals("completed"), "Real biometric draft creation and native verification completed: " + test.error(receipt));
            test.require(readExisting(grant, "target").equals(target) && readExisting(grant, "sibling").equals(sibling), "Creation preserves existing files");
        }
        CompletableFuture<JSONObject> revoked = request("revoked draft");
        awaitConsent(revoked);
        long stopped = SystemClock.elapsedRealtime();
        test.runOnMainSync(() -> {
            service.stopSession("Owner stops and revokes draft folder in QA");
            try { folders.revoke(id); } catch (ApiException failure) { throw new IllegalStateException(failure); }
        });
        test.require(SystemClock.elapsedRealtime() - stopped < 1000 && service.pairingToken() == null, "Stop and folder revoke remain responsive during consent");
        test.require(revoked.get(5, TimeUnit.SECONDS).optJSONObject("error") != null, "Stopped review does not report completed");
        test.require(folders.grants().stream().noneMatch(value -> value.resourceId.equals(id)), "Folder local authority removed");
    }
    private String readExisting(FolderPolicy.Grant grant, String child) throws Exception {
        try (android.os.ParcelFileDescriptor file = service.getContentResolver().openFileDescriptor(DocumentsContract.buildDocumentUriUsingTree(grant.uri, child), "r")) {
            if (file == null) throw new AssertionError("Independent fixture verifier unavailable");
            try (java.io.InputStream input = new android.os.ParcelFileDescriptor.AutoCloseInputStream(file.dup())) { return DocumentText.read(input); }
        }
    }
    private JSONObject parameters(String resource, String text) { return Json.object("resourceId", resource, "text", text, "deadlineAt", System.currentTimeMillis() + 45000); }
    private CompletableFuture<JSONObject> request(String text) {
        return CompletableFuture.supplyAsync(() -> { try { return test.call("draft.create", parameters(id, text)); } catch (Exception failure) { throw new IllegalStateException(failure); } });
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
