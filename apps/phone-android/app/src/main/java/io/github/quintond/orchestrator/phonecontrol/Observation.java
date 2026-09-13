// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
package io.github.quintond.orchestrator.phonecontrol;

import android.app.KeyguardManager;
import android.graphics.Rect;
import android.os.SystemClock;
import android.view.Display;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

final class Observation {
    final String id = UUID.randomUUID().toString();
    final String packageName;
    final String identity;
    final int windowId;
    final Rect bounds;
    final Rect windowBounds;
    final Rect touchBounds;
    final long elapsed = SystemClock.elapsedRealtime();
    final long capturedAt = System.currentTimeMillis();
    final long contentEpoch;
    final JSONArray nodes = new JSONArray();
    final Map<String, AccessibilityNodeInfo> references = new HashMap<>();
    final StringBuilder fingerprint = new StringBuilder();
    String digest;
    int visited;

    private Observation(String packageName, String identity, AccessibilityWindowInfo window, long epoch, Rect safeDisplayBounds, Rect touchDisplayBounds) {
        this.packageName = packageName;
        this.identity = identity;
        windowId = window.getId();
        bounds = new Rect();
        window.getBoundsInScreen(bounds);
        windowBounds = new Rect(bounds);
        if (!bounds.intersect(safeDisplayBounds)) bounds.setEmpty();
        touchBounds = new Rect(bounds);
        if (!touchBounds.intersect(touchDisplayBounds)) touchBounds.setEmpty();
        else touchBounds.offset(-bounds.left, -bounds.top);
        contentEpoch = epoch;
    }

    static Observation capture(PhoneService service, Set<String> scope) throws ApiException {
        service.requireSession();
        if (service.getSystemService(KeyguardManager.class).isKeyguardLocked()) throw new ApiException("protected_window", "Device is locked");
        AccessibilityNodeInfo root = service.getRootInActiveWindow();
        if (root == null || root.getPackageName() == null) throw new ApiException("window_unavailable", "No active app window");
        String name = root.getPackageName().toString();
        if (!scope.contains(name)) throw new ApiException("forbidden", "Foreground app is outside the requested scope");
        service.policy.requireApp(name);
        AccessibilityWindowInfo window = root.getWindow();
        if (window == null || !window.isActive() || !window.isFocused() || window.getType() != AccessibilityWindowInfo.TYPE_APPLICATION
                || window.getDisplayId() != Display.DEFAULT_DISPLAY || window.isInPictureInPictureMode())
            throw new ApiException("protected_window", "A focused application window on the primary display is required");
        android.view.WindowMetrics metrics = service.getSystemService(android.view.WindowManager.class).getMaximumWindowMetrics();
        android.graphics.Insets insets = metrics.getWindowInsets().getInsetsIgnoringVisibility(android.view.WindowInsets.Type.systemBars() | android.view.WindowInsets.Type.displayCutout());
        Rect safeDisplayBounds = new Rect(metrics.getBounds());
        safeDisplayBounds.inset(insets.left, insets.top, insets.right, insets.bottom);
        android.graphics.Insets gestures = metrics.getWindowInsets().getInsetsIgnoringVisibility(
                android.view.WindowInsets.Type.systemGestures() | android.view.WindowInsets.Type.mandatorySystemGestures());
        Rect touchDisplayBounds = new Rect(metrics.getBounds());
        touchDisplayBounds.inset(gestures.left, gestures.top, gestures.right, gestures.bottom);
        Observation observation = new Observation(name, service.policy.identity(name), window, service.contentEpoch(name), safeDisplayBounds, touchDisplayBounds);
        if (observation.bounds.width() < 1 || observation.bounds.height() < 1 || observation.bounds.width() > 4096 || observation.bounds.height() > 4096)
            throw new ApiException("window_unavailable", "Unsupported window dimensions");
        for (AccessibilityWindowInfo other : service.getWindows()) {
            if (other.getId() == window.getId()) continue;
            Rect otherBounds = new Rect();
            other.getBoundsInScreen(otherBounds);
            if (other.getLayer() > window.getLayer() && Rect.intersects(observation.bounds, otherBounds))
                throw new ApiException("protected_window", "An overlay, keyboard, or other window obscures the target");
        }
        observation.visit(root, "n_0", 0);
        if (service.contentEpoch(name) != observation.contentEpoch) throw new ApiException("stale_observation", "Window changed during observation");
        observation.digest = Policy.digest(observation.fingerprint.toString());
        return observation;
    }

    private void visit(AccessibilityNodeInfo node, String id, int depth) throws ApiException {
        if (++visited > Policy.MAX_NODES || depth > Policy.MAX_DEPTH) throw new ApiException("tree_too_large", "Window exceeds bounded observation limits");
        if (node.isPassword() || node.isAccessibilityDataSensitive()) throw new ApiException("sensitive_window", "Sensitive or password content is withheld");
        if (node.getPackageName() != null && !packageName.contentEquals(node.getPackageName())) throw new ApiException("protected_window", "Window contains another app's content");
        Rect location = new Rect();
        node.getBoundsInScreen(location);
        location.offset(-bounds.left, -bounds.top);
        String text = bounded(node.getText());
        String description = bounded(node.getContentDescription());
        fingerprint.append(id).append('|').append(location);
        appendStateText(node.getViewIdResourceName());
        appendStateText(node.getClassName());
        fingerprint.append('|').append(node.isEnabled()).append('|').append(node.isClickable()).append('|')
                .append(node.isEditable()).append('|').append(node.isVisibleToUser()).append('|').append(text.length()).append(':').append(text)
                .append('|').append(description.length()).append(':').append(description);
        appendSemanticState(node);
        fingerprint.append('\n');
        Rect visible = new Rect(location);
        if (node.isVisibleToUser() && visible.intersect(0, 0, bounds.width(), bounds.height()) && !visible.isEmpty()) {
            JSONObject result = Json.object("id", id, "bounds", Json.object("left", visible.left, "top", visible.top, "right", visible.right, "bottom", visible.bottom),
                    "editable", node.isEditable(), "clickable", node.isClickable());
            NodeSemantics.append(result, node);
            // Editable values may contain private input even when the app forgets password flags.
            try {
                if (!node.isEditable() && !text.isEmpty()) result.put("text", text.substring(0, Math.min(text.length(), 256)));
                if (!description.isEmpty()) result.put("description", description.substring(0, Math.min(description.length(), 256)));
            } catch (org.json.JSONException impossible) { throw new AssertionError(impossible); }
            nodes.put(result);
            references.put(id, node);
        }
        if (node.getChildCount() > Policy.MAX_NODES) throw new ApiException("tree_too_large", "Window has too many children");
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child == null) throw new ApiException("window_unavailable", "Window tree is incomplete");
            visit(child, id + "_" + i, depth + 1);
        }
    }

    private void appendSemanticState(AccessibilityNodeInfo node) throws ApiException {
        // Consent can cause focus events without changing content. Exposed control state must
        // still match; these values describe the app and do not grant or restrict its actions.
        int checked = android.os.Build.VERSION.SDK_INT >= 36 ? node.getChecked() : (node.isChecked() ? 1 : 0);
        fingerprint.append('|').append(node.isCheckable()).append('|').append(checked).append('|').append(node.isSelected())
                .append('|').append(node.isLongClickable()).append('|').append(node.isScrollable()).append('|').append(node.isDismissable())
                .append('|').append(node.isContentInvalid()).append('|').append(node.isShowingHintText())
                .append('|').append(node.getInputType()).append('|').append(node.getMaxTextLength())
                .append('|').append(node.getTextSelectionStart()).append('|').append(node.getTextSelectionEnd());
        fingerprint.append("|actions:").append(NodeSemantics.actions(node));
        appendStateText(node.getStateDescription());
        appendStateText(node.getHintText());
        appendStateText(node.getError());
        if (android.os.Build.VERSION.SDK_INT >= 36) appendStateText(node.getSupplementalDescription());
        AccessibilityNodeInfo.RangeInfo range = node.getRangeInfo();
        fingerprint.append("|range:").append(range != null);
        if (range != null) fingerprint.append('|').append(range.getType()).append('|').append(range.getMin())
                .append('|').append(range.getMax()).append('|').append(range.getCurrent());
        AccessibilityNodeInfo.CollectionItemInfo item = node.getCollectionItemInfo();
        fingerprint.append("|item:").append(item != null);
        if (item != null) fingerprint.append('|').append(item.getRowIndex()).append('|').append(item.getRowSpan())
                .append('|').append(item.getColumnIndex()).append('|').append(item.getColumnSpan()).append('|').append(item.isSelected());
    }
    private void appendStateText(CharSequence value) throws ApiException {
        StateFingerprint.append(fingerprint, value);
    }
    private static String bounded(CharSequence value) throws ApiException {
        if (value == null) return "";
        if (value.length() > 8192) throw new ApiException("tree_too_large", "Node content exceeds observation limits");
        return value.toString();
    }
    boolean same(Observation other) {
        return ActionRevalidation.beforeConsent(state(), other.state());
    }
    boolean sameAfterConsent(Observation other, String method, String key) {
        return ActionRevalidation.afterConsent(state(), other.state(), method, key);
    }
    String difference(Observation other) {
        return ActionRevalidation.difference(state(), other.state());
    }
    private ActionRevalidation.State state() {
        return new ActionRevalidation.State(packageName, identity, windowId, geometry(bounds),
                geometry(windowBounds), geometry(touchBounds), digest, contentEpoch);
    }
    private static ActionRevalidation.Bounds geometry(Rect rectangle) {
        return new ActionRevalidation.Bounds(rectangle.left, rectangle.top, rectangle.right, rectangle.bottom);
    }
    JSONObject response() {
        return Json.object("observationId", id, "packageName", packageName, "windowId", windowId, "width", bounds.width(), "height", bounds.height(),
                "capturedAt", capturedAt, "nodes", nodes, "touchBounds", Json.object("left", touchBounds.left, "top", touchBounds.top, "right", touchBounds.right, "bottom", touchBounds.bottom));
    }
    boolean permitsTouch(double x, double y) {
        // Match the float screen coordinates actually passed to Android, including rounding at an edge.
        return permitsScreenTouch((float) x + bounds.left, (float) y + bounds.top);
    }
    boolean permitsScreenTouch(float x, float y) {
        return Policy.touchPoint(x, y, bounds.left + touchBounds.left, bounds.top + touchBounds.top,
                bounds.left + touchBounds.right, bounds.top + touchBounds.bottom);
    }
}
