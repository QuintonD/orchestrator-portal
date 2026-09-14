// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
package io.github.quintond.orchestrator.phonecontrol;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Set;

/** Platform-independent bounds used at every request and dispatch boundary. */
final class Policy {
    static final int PORT = 8837;
    static final long SESSION_MS = 10 * 60_000L;
    static final long OBSERVATION_MS = 60_000L;
    static final int MAX_NODES = 300;
    static final int MAX_DEPTH = 24;
    static final int MAX_RECEIPTS = 256;
    static final long SCREENSHOT_INTERVAL_MS = 400;
    static final int MAX_SCREENSHOT_PIXELS = 6_000_000;
    static final int MAX_PNG_BYTES = 4_000_000;
    static final Set<String> OPERATIONS = Set.of("observe", "apps.list", "app.launch", "tap", "longPress", "swipe", "pinch", "node.click", "node.scroll", "type", "key", "fixture.increment", "document.read", "document.replace", "draft.create");
    static final Set<String> MUTATIONS = Set.of("app.launch", "tap", "longPress", "swipe", "pinch", "node.click", "node.scroll", "type", "key", "fixture.increment", "document.replace", "draft.create");

    private Policy() { }

    static boolean protectedPackage(String name, String self) {
        if (name == null || name.equals(self) || name.startsWith("io.github.quintond.orchestrator.phonecontrol")) return true;
        return name.equals("android") || name.startsWith("com.android.") || name.startsWith("com.google.android.permissioncontroller")
                || name.startsWith("com.google.android.packageinstaller") || name.startsWith("com.google.android.gms")
                || name.startsWith("com.google.android.gsf") || name.toLowerCase(java.util.Locale.ROOT).contains("keyguard")
                || name.toLowerCase(java.util.Locale.ROOT).contains("permissioncontroller")
                || name.toLowerCase(java.util.Locale.ROOT).contains("packageinstaller");
    }

    static boolean validId(String id) { return id != null && id.matches("[A-Za-z0-9_-]{1,96}"); }
    static boolean validPackage(String name) { return name != null && name.length() <= 200 && name.matches("[A-Za-z][A-Za-z0-9_]*(\\.[A-Za-z][A-Za-z0-9_]*)+"); }
    static boolean fresh(long now, long captured) { return now >= captured && now - captured <= OBSERVATION_MS; }
    static boolean point(double x, double y, int width, int height) {
        return Double.isFinite(x) && Double.isFinite(y) && x >= 0 && y >= 0 && x < width && y < height;
    }
    static boolean touchPoint(double x, double y, int left, int top, int right, int bottom) {
        // All injected paths are straight segments; endpoints inside this convex rectangle keep the entire path inside it.
        return Double.isFinite(x) && Double.isFinite(y) && right > left && bottom > top
                && x >= left && y >= top && x < right && y < bottom;
    }
    static boolean duration(long duration) { return duration >= 100 && duration <= 2_000; }
    static boolean capturePixels(int width, int height) {
        return width > 0 && height > 0 && (long) width * height <= MAX_SCREENSHOT_PIXELS;
    }
    static boolean tokenEquals(String expected, String supplied) {
        return expected != null && supplied != null && supplied.length() <= 128
                && MessageDigest.isEqual(expected.getBytes(StandardCharsets.US_ASCII), supplied.getBytes(StandardCharsets.US_ASCII));
    }
    static String digest(String value) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder();
            for (byte b : hash) result.append(String.format(java.util.Locale.ROOT, "%02x", b & 255));
            return result.toString();
        } catch (NoSuchAlgorithmException impossible) { throw new AssertionError(impossible); }
    }
}
