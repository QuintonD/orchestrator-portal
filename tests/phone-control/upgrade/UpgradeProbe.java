// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ../../../components/phone-control/ATTRIBUTION.md.
package io.github.quintond.orchestrator.phoneupgrade;

import android.app.Instrumentation;
import android.app.UiAutomation;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.Set;
import java.util.TreeSet;

/** Separately signed owner test APK; never included in either production companion. */
public final class UpgradeProbe extends Instrumentation {
    private static final String TARGET = "io.github.quintond.orchestrator.phonecontrol";
    private static final String FIXTURE = "io.github.quintond.orchestrator.phonefixture.debug";
    private static final Set<String> OPERATIONS = Set.of("observe", "apps.list", "key");
    private static final String CANARY = "Owner-local phone upgrade data: preserve bytes and settings.";
    private String phase;
    @Override public void onCreate(Bundle arguments) { super.onCreate(arguments); phase = arguments.getString("phase", "invalid"); start(); }
    private static void require(boolean value, String code) { if (!value) throw new IllegalStateException(code); }
    private Object invoke(Object receiver, String name, Class<?>[] types, Object... arguments) throws Exception {
        Method method = receiver.getClass().getDeclaredMethod(name, types); method.setAccessible(true); return method.invoke(receiver, arguments);
    }
    private Object field(Class<?> type, Object receiver, String name) throws Exception { Field value = type.getDeclaredField(name); value.setAccessible(true); return value.get(receiver); }
    private void shell(String command) throws Exception { try (android.os.ParcelFileDescriptor descriptor = getUiAutomation(UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES).executeShellCommand(command); java.io.FileInputStream stream = new java.io.FileInputStream(descriptor.getFileDescriptor())) { stream.readAllBytes(); } }
    private static String hash(byte[] bytes) throws Exception {
        StringBuilder value = new StringBuilder(); for (byte item : MessageDigest.getInstance("SHA-256").digest(bytes)) value.append(String.format(java.util.Locale.ROOT, "%02x", item & 255)); return value.toString();
    }
    @Override public void onStart() {
        Bundle result = new Bundle();
        try {
            require(TARGET.equals(getTargetContext().getPackageName()), "production_identity_required");
            require(Set.of("seed", "verify").contains(phase), "invalid_upgrade_phase");
            Class<?> serviceType = Class.forName(TARGET + ".PhoneService", true, getTargetContext().getClassLoader());
            Object service = field(serviceType, null, "instance"); Object policy;
            if (phase.equals("seed")) {
                getUiAutomation(UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES);
                // Seeding needs a live service. Verification reads persisted
                // policy directly, independent of instrumentation rebinding.
                shell("settings put secure enabled_accessibility_services null"); Thread.sleep(500);
                shell("settings put secure enabled_accessibility_services " + TARGET + "/" + TARGET + ".PhoneService");
                shell("settings put secure accessibility_enabled 1");
                service = null; long until = System.currentTimeMillis() + 20_000;
                while (service == null && System.currentTimeMillis() < until) { service = field(serviceType, null, "instance"); if (service == null) Thread.sleep(100); }
                require(service != null, "accessibility_not_connected"); policy = field(serviceType, service, "policy");
            } else {
                Class<?> policyType = Class.forName(TARGET + ".LocalPolicy", true, getTargetContext().getClassLoader());
                java.lang.reflect.Constructor<?> constructor = policyType.getDeclaredConstructor(Context.class); constructor.setAccessible(true); policy = constructor.newInstance(getTargetContext());
            }
            final Object current = service;
            SharedPreferences preferences = getTargetContext().getSharedPreferences("phone-policy", Context.MODE_PRIVATE);
            java.io.File canary = new java.io.File(getTargetContext().getFilesDir(), "upgrade-owner-data.txt");
            if (phase.equals("seed")) {
                require(!preferences.contains("screenshots"), "baseline_already_has_screenshot_setting");
                invoke(policy, "app", new Class<?>[] { String.class, boolean.class }, FIXTURE, true);
                for (String operation : OPERATIONS) invoke(policy, "operation", new Class<?>[] { String.class, boolean.class }, operation, true);
                require(preferences.edit().putString("upgrade.owner.note", "preserve-local-settings").putInt("upgrade.owner.scale", 130).commit(), "seed_settings_failed");
                Files.write(canary.toPath(), CANARY.getBytes(StandardCharsets.UTF_8));
                runOnMainSync(() -> { try { invoke(current, "startSession", new Class<?>[] {}); } catch (Exception error) { throw new IllegalStateException("seed_session_failed", error); } });
            } else {
                require(service == null || invoke(service, "pairingToken", new Class<?>[] {}) == null, "authority_survived_upgrade");
                require(Boolean.FALSE.equals(invoke(policy, "screenshots", new Class<?>[] {})), "new_disclosure_not_default_deny");
                require(!preferences.contains("screenshots"), "upgrade_silently_granted_disclosure");
            }
            require(preferences.getStringSet("apps", Set.of()).equals(Set.of(FIXTURE)), "allowlist_not_preserved");
            require(preferences.getStringSet("operations", Set.of()).equals(OPERATIONS), "operation_settings_not_preserved");
            require("preserve-local-settings".equals(preferences.getString("upgrade.owner.note", "")) && preferences.getInt("upgrade.owner.scale", 0) == 130, "owner_settings_not_preserved");
            require(CANARY.equals(Files.readString(canary.toPath(), StandardCharsets.UTF_8)), "owner_data_not_preserved");
            invoke(policy, "requireApp", new Class<?>[] { String.class }, FIXTURE);
            String canonical = new TreeSet<>(preferences.getStringSet("apps", Set.of())) + "|" + new TreeSet<>(preferences.getStringSet("operations", Set.of())) + "|" + preferences.getString("pin:" + FIXTURE, "") + "|" + preferences.getString("upgrade.owner.note", "") + "|" + preferences.getInt("upgrade.owner.scale", 0) + "|" + CANARY;
            result.putString("upgrade_snapshot", hash(canonical.getBytes(StandardCharsets.UTF_8)));
            result.putString("upgrade_phase", phase);
            if (phase.equals("seed")) {
                String token = (String) invoke(service, "pairingToken", new Class<?>[] {}); require(token != null && token.length() >= 32, "active_baseline_session_required");
                // The host captures this private pipe value in memory, never an evidence log.
                result.putString("upgrade_token", token); sendStatus(0, result);
                Thread.sleep(600_000); throw new IllegalStateException("upgrade_not_applied_before_expiry");
            }
            result.putString("stream", "PHONE_UPGRADE_VERIFIED\n"); finish(android.app.Activity.RESULT_OK, result);
        } catch (Throwable failure) {
            Throwable cause = failure instanceof java.lang.reflect.InvocationTargetException && failure.getCause() != null ? failure.getCause() : failure;
            String code = cause.getMessage() != null && cause.getMessage().matches("[a-z_]+") ? cause.getMessage() : cause.getClass().getSimpleName();
            Bundle error = new Bundle(); error.putString("stream", "PHONE_UPGRADE_FAILED " + code + "\n"); finish(android.app.Activity.RESULT_CANCELED, error);
        }
    }
}
