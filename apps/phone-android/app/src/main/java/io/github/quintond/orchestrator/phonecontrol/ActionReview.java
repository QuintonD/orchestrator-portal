// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
package io.github.quintond.orchestrator.phonecontrol;

import android.graphics.Rect;
import android.view.accessibility.AccessibilityNodeInfo;
import org.json.JSONArray;
import org.json.JSONObject;

/** Human review text; the complete machine request remains bound separately to the crypto operation. */
final class ActionReview {
    private ActionReview() { }
    static String describe(String method, JSONObject params, Observation observation) throws ApiException {
        String units = " Coordinates are pixels from the top left of the shared app area.";
        return switch (method) {
            case "app.launch" -> "Open this app.";
            case "tap" -> "Tap " + point(params, "x", "y") + "." + units;
            case "longPress" -> "Press and hold " + point(params, "x", "y") + " for " + params.optLong("durationMs") + " milliseconds." + units;
            case "pinch" -> "Pinch around " + point(params, "centerX", "centerY") + " with scale " + params.optDouble("scale") + " over " + params.optLong("durationMs") + " milliseconds." + units;
            case "swipe" -> {
                JSONArray points = params.optJSONArray("points");
                StringBuilder path = new StringBuilder();
                for (int i = 0; i < points.length(); i++) { if (i > 0) path.append(" → "); path.append(point(points.optJSONObject(i), "x", "y")); }
                yield "Swipe through " + path + " over " + params.optLong("durationMs") + " milliseconds." + units;
            }
            case "node.click" -> "Activate this control:\n" + control(params, observation);
            case "node.scroll" -> "Scroll this control " + params.optString("direction") + " by one app-defined step:\n" + control(params, observation);
            case "type" -> "Replace this field's contents:\n" + control(params, observation) + "\n\nWith this exact text:\n“" + Json.string(params, "text", 2000) + "”";
            case "key" -> params.optString("key").equals("home")
                    ? "Leave this app and go to the phone's home screen, even if its screen content changes during approval. Leaving may save changes or cause other effects in the app."
                    : "Go back to the previous screen.";
            default -> throw new ApiException("unsupported_method", "Unsupported review action");
        };
    }
    private static String point(JSONObject point, String x, String y) { return "(" + point.opt(x) + ", " + point.opt(y) + ")"; }
    private static String control(JSONObject params, Observation observation) {
        AccessibilityNodeInfo node = observation.references.get(params.optString("nodeId"));
        CharSequence label = node.getContentDescription();
        if (label == null || label.length() == 0) label = node.isEditable() ? node.getHintText() : node.getText();
        Rect bounds = new Rect(); node.getBoundsInScreen(bounds); bounds.offset(-observation.bounds.left, -observation.bounds.top);
        return (label == null || label.length() == 0 ? "Unlabelled control" : label.toString()) + "\nArea: (" + bounds.left + ", " + bounds.top + ") to (" + bounds.right + ", " + bounds.bottom + ")";
    }
}
