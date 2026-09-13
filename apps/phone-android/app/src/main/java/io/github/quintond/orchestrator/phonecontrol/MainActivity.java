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
        label("Pair through USB debugging: adb forward tcp:8837 tcp:8837. Manually enter the token above in the local broker. The token rotates at each session start and is never returned by the API. USB debugging and the paired host are trusted administrator access, beyond these app restrictions.", 16);
        button("About, source, and license", this::legal);
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
