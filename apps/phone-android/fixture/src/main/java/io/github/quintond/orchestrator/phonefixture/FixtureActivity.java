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

/** No permissions, network, exports beyond this screen, or real-world effects. */
@android.annotation.SuppressLint({"SetTextI18n", "ClickableViewAccessibility"}) // Fixed fixture text; touch pad reports raw gestures and has no semantic click action.
public final class FixtureActivity extends Activity {
    private int count;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        count = getPreferences(MODE_PRIVATE).getInt("count", 0);
        LinearLayout content = new LinearLayout(this); content.setOrientation(LinearLayout.VERTICAL); content.setPadding(24, 60, 24, 24);
        content.setOnApplyWindowInsetsListener((view, insets) -> {
            android.graphics.Insets safe = insets.getInsets(android.view.WindowInsets.Type.systemBars() | android.view.WindowInsets.Type.displayCutout());
            view.setPadding(safe.left + 24, safe.top + 24, safe.right + 24, safe.bottom + 24);
            return insets;
        });
        TextView title = new TextView(this); title.setText("Harmless phone control fixture"); title.setTextSize(24); content.addView(title);
        TextView counter = new TextView(this); counter.setId(R.id.count); counter.setText("Counter: " + count); counter.setTextSize(24); content.addView(counter);
        LinearLayout semanticControls = new LinearLayout(this);
        CheckBox semantic = new CheckBox(this); semantic.setText("Semantic checkbox"); semantic.setStateDescription("Fixture checkbox state");
        semanticControls.addView(semantic, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1));
        Button deferredSemantic = new Button(this); deferredSemantic.setAllCaps(false); deferredSemantic.setText("Toggle checkbox in two seconds");
        // Only checked state changes: labels, bounds, and the harmless counter stay constant.
        deferredSemantic.setOnClickListener(view -> semantic.postDelayed(() -> semantic.setChecked(!semantic.isChecked()), 2000));
        semanticControls.addView(deferredSemantic, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1));
        content.addView(semanticControls);
        Button increment = new Button(this); increment.setId(R.id.increment); increment.setText("Increment harmless counter");
        increment.setAllCaps(false);
        increment.setOnClickListener(view -> { count = (count + 1) % 1000; getPreferences(MODE_PRIVATE).edit().putInt("count", count).apply(); counter.setText("Counter: " + count); });
        content.addView(increment);
        EditText input = new EditText(this); input.setHint("Test input (editable value withheld)"); input.setInputType(InputType.TYPE_CLASS_TEXT); input.setImportantForAutofill(android.view.View.IMPORTANT_FOR_AUTOFILL_NO); content.addView(input);
        Button secure = new Button(this); secure.setText("Toggle secure window"); secure.setAllCaps(false); secure.setOnClickListener(view -> {
            boolean enabled = (getWindow().getAttributes().flags & WindowManager.LayoutParams.FLAG_SECURE) != 0;
            if (enabled) getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE); else getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        }); content.addView(secure);
        Button password = new Button(this); password.setText("Toggle password field"); password.setAllCaps(false); password.setOnClickListener(view -> {
            input.setInputType(input.getInputType() == (InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD) ? InputType.TYPE_CLASS_TEXT : InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        }); content.addView(password);
        TextView pad = new TextView(this); pad.setId(R.id.gesture_pad); pad.setText("Gesture test pad"); pad.setTextSize(20); pad.setGravity(android.view.Gravity.CENTER); pad.setBackgroundColor(0xffd9edf0);
        TextView events = new TextView(this); events.setId(R.id.gesture_status); events.setText("Pad: downs 0; ups 0; pointers 1; moves 0; long 0");
        int[] totals = {0, 0, 1, 0, 0};
        pad.setOnTouchListener((view, event) -> {
            if (event.getActionMasked() == android.view.MotionEvent.ACTION_DOWN) totals[0]++;
            if (event.getActionMasked() == android.view.MotionEvent.ACTION_UP) { totals[1]++; if (event.getEventTime() - event.getDownTime() >= 500) totals[4]++; }
            if (event.getActionMasked() == android.view.MotionEvent.ACTION_MOVE) totals[3]++;
            totals[2] = Math.max(totals[2], event.getPointerCount());
            events.setText("Pad: downs " + totals[0] + "; ups " + totals[1] + "; pointers " + totals[2] + "; moves " + totals[3] + "; long " + totals[4]);
            return true;
        });
        content.addView(pad, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, (int) (180 * getResources().getDisplayMetrics().density)));
        content.addView(events);
        Button deferred = new Button(this); deferred.setAllCaps(false); deferred.setText("Change counter in two seconds");
        deferred.setOnClickListener(view -> content.postDelayed(() -> {
            count = (count + 1) % 1000; getPreferences(MODE_PRIVATE).edit().putInt("count", count).apply(); counter.setText("Counter: " + count);
        }, 2000));
        content.addView(deferred);
        TextView legal = new TextView(this); legal.setText("Orchestrator Phone Control — created by the Orchestrator contributors.\nhttps://github.com/QuintonD/orchestrator-portal\nAGPL-3.0-only; no warranty. License and attribution included in source and companion About."); content.addView(legal);
        content.setFocusableInTouchMode(true);
        setContentView(content);
        content.requestFocus();
    }
}
