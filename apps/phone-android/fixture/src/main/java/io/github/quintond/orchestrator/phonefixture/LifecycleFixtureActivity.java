// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
package io.github.quintond.orchestrator.phonefixture;

import android.app.Activity;
import android.os.Bundle;
import android.text.InputType;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.util.Set;

/** Synthetic pause-time changes; no companion test seam or external effects. */
@android.annotation.SuppressLint("SetTextI18n")
public final class LifecycleFixtureActivity extends Activity {
    private String change;
    private boolean changed;
    private int clicks;
    private TextView status;
    private TextView clickStatus;
    private CheckBox check;
    private EditText input;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        change = getIntent().getStringExtra("pauseChange");
        if (!Set.of("none", "content", "secure", "password").contains(change == null ? "" : change)) { finish(); return; }
        changed = state != null && state.getBoolean("changed");
        clicks = state == null ? 0 : state.getInt("clicks");
        LinearLayout content = new LinearLayout(this); content.setOrientation(LinearLayout.VERTICAL);
        content.setOnApplyWindowInsetsListener((view, insets) -> {
            android.graphics.Insets safe = insets.getInsets(android.view.WindowInsets.Type.systemBars() | android.view.WindowInsets.Type.displayCutout());
            view.setPadding(safe.left + 24, safe.top + 24, safe.right + 24, safe.bottom + 24); return insets;
        });
        TextView title = new TextView(this); title.setText("Harmless consent lifecycle fixture"); title.setTextSize(24); content.addView(title);
        status = new TextView(this); status.setId(R.id.lifecycle_status); content.addView(status);
        check = new CheckBox(this); check.setId(R.id.lifecycle_check); check.setText("Synthetic pause state"); content.addView(check);
        clickStatus = new TextView(this); clickStatus.setId(R.id.lifecycle_clicks); content.addView(clickStatus);
        Button action = new Button(this); action.setId(R.id.increment); action.setText("Increment harmless counter"); action.setAllCaps(false);
        action.setOnClickListener(view -> { clicks++; render(); }); content.addView(action);
        input = new EditText(this); input.setId(R.id.lifecycle_input); input.setHint("Synthetic empty input");
        input.setInputType(InputType.TYPE_CLASS_TEXT); input.setImportantForAutofill(android.view.View.IMPORTANT_FOR_AUTOFILL_NO); content.addView(input);
        content.setFocusableInTouchMode(true); setContentView(content); render(); content.requestFocus();
    }

    @Override protected void onPause() {
        super.onPause();
        // The consent Activity causes this real lifecycle transition. Apply once,
        // synchronously, without timers that could fire before observation.
        if (!changed && change != null && !change.equals("none") && !isFinishing()) { changed = true; render(); }
    }

    private void render() {
        status.setText(changed ? "Pause change applied" : "Pause change pending");
        check.setChecked(changed); clickStatus.setText("Action clicks: " + clicks);
        if (changed && change.equals("secure")) getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        if (changed && change.equals("password")) input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
    }

    @Override protected void onSaveInstanceState(Bundle state) {
        state.putBoolean("changed", changed); state.putInt("clicks", clicks); super.onSaveInstanceState(state);
    }
}
