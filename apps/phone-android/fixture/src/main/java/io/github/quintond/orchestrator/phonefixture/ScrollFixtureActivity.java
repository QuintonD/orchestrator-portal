// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
package io.github.quintond.orchestrator.phonefixture;

import android.app.Activity;
import android.os.Bundle;
import android.widget.CheckBox;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/** Separate screen keeps semantic-scroll QA independent of gesture-pad layout. */
@android.annotation.SuppressLint("SetTextI18n")
public final class ScrollFixtureActivity extends Activity {
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        ScrollView scroll = new ScrollView(this); scroll.setId(R.id.scroll_document);
        scroll.setContentDescription("Scrollable fixture document");
        scroll.setOnApplyWindowInsetsListener((view, insets) -> {
            android.graphics.Insets safe = insets.getInsets(android.view.WindowInsets.Type.systemBars() | android.view.WindowInsets.Type.displayCutout());
            view.setPadding(safe.left + 24, safe.top + 24, safe.right + 24, safe.bottom + 24); return insets;
        });
        LinearLayout content = new LinearLayout(this); content.setOrientation(LinearLayout.VERTICAL);
        CheckBox check = new CheckBox(this); check.setId(R.id.semantic_check); check.setText("Reviewed draft"); check.setChecked(true); content.addView(check);
        for (int index = 0; index < 30; index++) {
            TextView row = new TextView(this); row.setText("Document paragraph " + index); row.setTextSize(22); row.setPadding(12, 40, 12, 40); content.addView(row);
        }
        scroll.addView(content); setContentView(scroll);
    }
}
