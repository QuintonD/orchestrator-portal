// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
package io.github.quintond.orchestrator.phonecontrol;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;

// This alpha's local safety disclosures are maintained in English as a single reviewed copy.
@android.annotation.SuppressLint("SetTextI18n")
public final class MainActivity extends Activity {
    private LocalPolicy policy;
    private LinearLayout content;
    private TextView sessionText;
    private static final int SELECT_DOCUMENT = 41;
    private static final int SELECT_FOLDER = 42;
    private final android.os.Handler refresh = new android.os.Handler(android.os.Looper.getMainLooper());
    private final Runnable ticker = new Runnable() {
        @Override public void run() { updateStatus(); refresh.postDelayed(this, 1000); }
    };
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
        getWindow().setHideOverlayWindows(true);
        policy = new LocalPolicy(this);
        if (getIntent().getBooleanExtra("stop", false) && PhoneService.instance != null) PhoneService.instance.stopSession("Stopped on phone");
        render();
    }
    @Override protected void onResume() { super.onResume(); refresh.post(ticker); }
    @Override protected void onPause() { refresh.removeCallbacks(ticker); super.onPause(); }
    private void render() {
        ScrollView scroll = new ScrollView(this);
        content = new LinearLayout(this); content.setOrientation(LinearLayout.VERTICAL); content.setPadding(24, 52, 24, 32);
        content.setOnApplyWindowInsetsListener((view, insets) -> {
            android.graphics.Insets safe = insets.getInsets(android.view.WindowInsets.Type.systemBars() | android.view.WindowInsets.Type.displayCutout());
            int padding = Math.round(16 * getResources().getDisplayMetrics().density);
            view.setPadding(safe.left + padding, safe.top + padding, safe.right + padding, safe.bottom + padding);
            return insets;
        });
        content.setAccessibilityDataSensitive(View.ACCESSIBILITY_DATA_SENSITIVE_YES);
        scroll.addView(content); setContentView(scroll);
        label("Phone Control Alpha", 26);
        label("Share only the apps you choose with a connected local agent. During a session, accessibility labels may leave the phone. Screenshots require the separate permission below and a caller request. Pixels can include editable text omitted from the tree. Your agent or model may receive this content. Grant apps whose data you are authorized to share.", 16);
        label("Every general action requires a separate strong biometric confirmation on this phone. This app cannot infer whether an action sends money, deletes data, or affects someone else. System apps, permissions, secure/password windows, keyboards, and this companion are excluded.", 16);
        button("Open Android accessibility settings", () -> { stopForPolicy(); startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)); });
        sessionText = label("Session stopped", 16);
        sessionText.setTextIsSelectable(true);
        button("Start a 10 minute session", () -> {
            PhoneService service = PhoneService.instance;
            if (service == null) { message("Enable the Phone Control accessibility service first."); return; }
            if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
                message("After allowing notifications, tap Start again."); return;
            }
            try { service.startSession(); updateStatus(); } catch (ApiException denied) { message(denied.getMessage()); }
        });
        button("STOP SESSION", () -> { if (PhoneService.instance != null) PhoneService.instance.stopSession("Stopped on phone"); updateStatus(); });
        CheckBox screenshots = new CheckBox(this); screenshots.setText("Allow screenshots of allowed apps to leave this phone"); screenshots.setChecked(policy.screenshots()); screenshots.setFilterTouchesWhenObscured(true);
        screenshots.setOnCheckedChangeListener((view, checked) -> {
            stopForPolicy();
            try { policy.screenshots(checked); } catch (ApiException denied) { screenshots.setChecked(policy.screenshots()); message(denied.getMessage()); }
        }); content.addView(screenshots);
        label("Draft folders: create new files only", 20);
        label("Choose a trusted folder for new plaintext drafts. Every creation needs full text review and your strong biometric confirmation. Agents cannot choose filenames or read existing file content through this grant. Android grants broader folder access; the provider must be trusted and may sync or act on drafts independently. Use a dedicated folder without publishing automation. Maximum 255 existing children, 2,000 characters and 8,192 UTF-8 bytes per draft.", 16);
        button("Select a folder for new drafts", () -> {
            stopForPolicy();
            Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
            try { startActivityForResult(picker, SELECT_FOLDER); }
            catch (android.content.ActivityNotFoundException unavailable) { message("No Android folder picker is available."); }
        });
        for (FolderPolicy.Grant grant : new FolderPolicy(this).grants()) {
            TextView folder = label(grant.name + "\nResource ID: " + grant.resourceId + "\nCreate new drafts only"
                    + "\nProvider: " + grant.provider + "\nSelected folder: " + grant.uri, 16);
            folder.setTextIsSelectable(true);
            button("Revoke draft folder " + grant.name, () -> {
                stopForPolicy();
                try { new FolderPolicy(this).revoke(grant.resourceId); render(); }
                catch (ApiException failure) { message(failure.getMessage()); }
            });
        }
        label("Allowed operations — changes stop the session", 20);
        for (String operation : new java.util.TreeSet<>(Policy.OPERATIONS)) {
            CheckBox box = new CheckBox(this); box.setText(operation); box.setChecked(policy.operations().contains(operation)); box.setFilterTouchesWhenObscured(true);
            box.setOnCheckedChangeListener((view, checked) -> { stopForPolicy(); policy.operation(operation, checked); }); content.addView(box);
        }
        label("Allowed user-installed apps — signing identity pinned", 20);
        Set<String> shown = new HashSet<>();
        for (ResolveInfo app : policy.availableApps()) {
            String name = app.activityInfo.packageName;
            if (!shown.add(name)) continue;
            CheckBox box = new CheckBox(this); box.setText(app.loadLabel(getPackageManager()) + "\n" + name); box.setChecked(policy.apps().contains(name)); box.setFilterTouchesWhenObscured(true);
            box.setOnCheckedChangeListener((view, checked) -> {
                stopForPolicy();
                try { policy.app(name, checked); } catch (ApiException denied) { box.setChecked(false); message(denied.getMessage()); }
            }); content.addView(box);
        }
        if (shown.isEmpty()) label("No eligible user-installed apps found. Install a test app or other user app, then reopen this screen.", 16);
        label("Advanced: exact plaintext documents", 20);
        label("Document grants are separate from screen and app permissions. Select a single text/plain file up to 2,000 characters and 8,192 UTF-8 bytes. The connected agent may read granted content; replacement also requires your strong biometric confirmation for each exact text. These exact-file grants never widen to folder grants. Account access and other document formats are unsupported.", 16);
        button("Select one plaintext document", () -> {
            stopForPolicy();
            Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("text/plain")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
            try { startActivityForResult(picker, SELECT_DOCUMENT); }
            catch (android.content.ActivityNotFoundException unavailable) { message("No Android document picker is available."); }
        });
        for (DocumentPolicy.Grant grant : new DocumentPolicy(this).grants()) {
            TextView document = label(grant.name + "\nResource ID: " + grant.resourceId + "\n" + (grant.write ? "Read and replace" : "Read only")
                    + "\nProvider: " + grant.provider + "\nExact URI: " + grant.uri, 16);
            document.setTextIsSelectable(true);
            button("Revoke document " + grant.name, () -> {
                stopForPolicy();
                try { new DocumentPolicy(this).revoke(grant.resourceId); render(); }
                catch (ApiException failure) { message(failure.getMessage()); }
            });
        }
        label("Pair through USB debugging: adb forward tcp:8837 tcp:8837. Manually enter the token above in the local broker. The token rotates at each session start and is never returned by the API. USB debugging and the paired host are trusted administrator access, beyond these app restrictions.", 16);
        button("About, source, and license", this::legal);
    }
    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == SELECT_FOLDER && resultCode == RESULT_OK) {
            stopForPolicy();
            if (data == null || data.getData() == null || data.getClipData() != null) { message("Select exactly one folder."); return; }
            FolderPolicy folders = new FolderPolicy(this);
            this.<FolderPolicy.Grant>localDocumentWork(ticket -> folders.inspect(data.getData(), data.getFlags()), selected -> {
                String disclosure = "Trust this provider to create separate new draft files?\n\nFolder: " + selected.name
                        + "\nResource ID: " + selected.resourceId + "\nProvider: " + selected.provider + "\nFolder URI: " + selected.uri
                        + "\nPinned provider signer/version/update: " + selected.identity
                        + "\n\nAndroid grants persistent read/write access to the folder and descendants. This adapter only creates unique new plaintext drafts after full review and strong biometric confirmation. It never reads existing file content, replaces, deletes, or publishes. "
                        + "A dishonest provider can lie about file identity and defeat safety checks; provider synchronization and other apps may share or act on drafts. Account identity and protection against concurrent writers are unavailable. Choose a dedicated trusted folder without publishing automation.";
                AlertDialog dialog = new AlertDialog.Builder(this).setTitle("Grant draft folder").setMessage(disclosure)
                        .setNegativeButton("Cancel", null).setPositiveButton("Trust and allow new drafts", (view, which) -> {
                            stopForPolicy();
                            localDocumentWork(ticket -> { folders.accept(selected, true, ticket); return true; }, saved -> render());
                        }).create();
                dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setFilterTouchesWhenObscured(true));
                dialog.show();
            });
            return;
        }
        if (requestCode != SELECT_DOCUMENT || resultCode != RESULT_OK) return;
        stopForPolicy();
        if (data == null || data.getData() == null || data.getClipData() != null) { message("Select exactly one document."); return; }
        DocumentPolicy documents = new DocumentPolicy(this);
        this.<DocumentPolicy.Grant>localDocumentWork(ticket -> documents.inspect(data.getData(), data.getFlags()), selected -> {
            String disclosure = "Trust this provider for the exact selected document?\n\n" + selected.name + "\nResource ID: " + selected.resourceId
                    + "\nProvider: " + selected.provider + "\nExact URI: " + selected.uri
                    + "\nPinned provider signer/version/update: " + selected.identity
                    + "\n\nThe provider controls what this URI reads and changes. Its signing identity and installed version are pinned. Android cannot attest the account behind this URI or prevent concurrent edits. Do not grant documents with unauthorized data. The full text can leave the phone through your connected agent.";
            AlertDialog.Builder dialog = new AlertDialog.Builder(this).setTitle("Grant one document").setMessage(disclosure)
                    .setNegativeButton("Cancel", null)
                    .setPositiveButton("Trust and allow read", (view, which) -> grantDocument(documents, selected, false));
            if (selected.write) dialog.setNeutralButton("Trust and allow read + replace", (view, which) -> grantDocument(documents, selected, true));
            AlertDialog shown = dialog.create(); shown.setOnShowListener(ignored -> {
                shown.getButton(AlertDialog.BUTTON_POSITIVE).setFilterTouchesWhenObscured(true);
                if (selected.write) shown.getButton(AlertDialog.BUTTON_NEUTRAL).setFilterTouchesWhenObscured(true);
            }); shown.show();
        });
    }
    private void grantDocument(DocumentPolicy documents, DocumentPolicy.Grant grant, boolean write) {
        stopForPolicy();
        localDocumentWork(ticket -> { documents.accept(grant, write, ticket); return true; }, saved -> render());
    }
    private <T> void localDocumentWork(DocumentWork.Action<T> action, java.util.function.Consumer<T> complete) {
        try {
            DocumentWork.Ticket<T> ticket = DocumentPolicy.WORK.start(action);
            refresh.postDelayed(() -> {
                if (!ticket.result.isDone()) { ticket.abandon(); message("Document provider timed out. Stop remains available; wait for the provider to settle before another request."); }
            }, 5000);
            ticket.result.whenComplete((result, failure) -> refresh.post(() -> {
                if (isFinishing() || isDestroyed() || ticket.abandoned) return;
                if (failure != null) message(failure instanceof ApiException denied ? denied.getMessage() : "The document provider could not complete this request.");
                else complete.accept(result);
            }));
        } catch (ApiException busy) { message(busy.getMessage()); }
    }
    private TextView label(String text, int size) { TextView view = new TextView(this); view.setText(text); view.setTextSize(size); view.setPadding(0, 12, 0, 12); content.addView(view); return view; }
    private void button(String text, Runnable action) { Button button = new Button(this); button.setText(text); button.setFilterTouchesWhenObscured(true); button.setOnClickListener(view -> action.run()); content.addView(button); }
    private void stopForPolicy() { if (PhoneService.instance != null) PhoneService.instance.stopSession("Policy changed on phone"); updateStatus(); }
    private void updateStatus() {
        if (sessionText == null) return;
        PhoneService service = PhoneService.instance;
        if (service == null) { sessionText.setText("Accessibility service is disabled. Session stopped."); return; }
        String token = service.pairingToken();
        sessionText.setText(service.status() + (token == null ? "" : "\nExpires: " + new java.util.Date(service.expiresAt()) + "\nPairing token (keep private):\n" + token));
    }
    private void message(String text) { new AlertDialog.Builder(this).setMessage(text).setPositiveButton("OK", null).show(); }
    private void legal() {
        String text = "Orchestrator Phone Control — created by the Orchestrator contributors\nhttps://github.com/quintond/orchestrator-portal\n\nGNU Affero General Public License version 3 only. No warranty. Required origin attribution is preserved under section 7(b).\n\n";
        try (java.io.InputStream source = getAssets().open("LICENSE")) { text += new String(source.readAllBytes(), StandardCharsets.UTF_8); }
        catch (java.io.IOException missing) { text += "See the LICENSE file in the source distribution."; }
        TextView view = new TextView(this); view.setText(text); view.setTextIsSelectable(true); view.setPadding(24, 24, 24, 24);
        ScrollView scroll = new ScrollView(this); scroll.addView(view);
        new AlertDialog.Builder(this).setTitle("Source and license").setView(scroll).setPositiveButton("Close", null).show();
    }
}
