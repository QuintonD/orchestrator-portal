// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
package io.github.quintond.orchestrator.phonecontrol;

import android.view.accessibility.AccessibilityNodeInfo;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Bounded app-provided semantics, never an authorization decision or proof of an effect. */
final class NodeSemantics {
    private NodeSemantics() { }
    static boolean supports(AccessibilityNodeInfo node, int action) {
        return node.getActionList().stream().anyMatch(item -> item.getId() == action);
    }
    static int scrollAction(String direction) throws ApiException {
        return switch (direction) {
            case "forward" -> AccessibilityNodeInfo.ACTION_SCROLL_FORWARD;
            case "backward" -> AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD;
            default -> throw new ApiException("invalid_request", "Scroll direction must be forward or backward");
        };
    }
    static JSONArray actions(AccessibilityNodeInfo node) {
        JSONArray actions = new JSONArray();
        if (supports(node, AccessibilityNodeInfo.ACTION_CLICK)) actions.put("click");
        if (supports(node, AccessibilityNodeInfo.ACTION_LONG_CLICK)) actions.put("longClick");
        if (supports(node, AccessibilityNodeInfo.ACTION_SCROLL_FORWARD)) actions.put("scrollForward");
        if (supports(node, AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD)) actions.put("scrollBackward");
        if (supports(node, AccessibilityNodeInfo.ACTION_SET_TEXT)) actions.put("setText");
        return actions;
    }
    static void append(JSONObject output, AccessibilityNodeInfo node) throws ApiException {
        int checked = android.os.Build.VERSION.SDK_INT >= 36 ? node.getChecked() : (node.isChecked() ? 1 : 0);
        try {
            output.put("enabled", node.isEnabled()).put("scrollable", node.isScrollable())
                    .put("checkable", node.isCheckable()).put("selected", node.isSelected())
                    .put("checkedState", checked == 2 ? "mixed" : checked == 1 ? "checked" : "unchecked")
                    .put("actions", actions(node));
            // Do not truncate identifiers into a different selector. Long identifiers are simply unavailable.
            identity(output, "resourceId", node.getViewIdResourceName());
            identity(output, "className", node.getClassName());
            label(output, "hintText", node.getHintText());
            // Editable controls can expose their current value as state description.
            if (!node.isEditable()) label(output, "stateDescription", node.getStateDescription());
        } catch (JSONException impossible) { throw new AssertionError(impossible); }
    }
    private static void identity(JSONObject output, String key, CharSequence value) throws JSONException {
        if (value != null && value.length() > 0 && value.length() <= 256) output.put(key, value.toString());
    }
    private static void label(JSONObject output, String key, CharSequence value) throws JSONException, ApiException {
        if (value == null || value.length() == 0) return;
        if (value.length() > 8192) throw new ApiException("tree_too_large", "Node content exceeds observation limits");
        output.put(key, value.toString().substring(0, Math.min(value.length(), 256)));
    }
}
