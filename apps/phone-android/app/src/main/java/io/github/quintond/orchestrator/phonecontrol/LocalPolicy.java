// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
package io.github.quintond.orchestrator.phonecontrol;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.content.pm.Signature;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

final class LocalPolicy {
    final Context context;
    final SharedPreferences preferences;
    LocalPolicy(Context context) { this.context = context; preferences = context.getSharedPreferences("phone-policy", Context.MODE_PRIVATE); }
    Set<String> apps() { return new HashSet<>(preferences.getStringSet("apps", Set.of())); }
    Set<String> operations() { return new HashSet<>(preferences.getStringSet("operations", Set.of())); }
    boolean screenshots() { return preferences.getBoolean("screenshots", false); }
    void screenshots(boolean allow) throws ApiException {
        if (!preferences.edit().putBoolean("screenshots", allow).commit()) throw new ApiException("storage_unavailable", "Could not save disclosure policy");
    }
    void app(String name, boolean allow) throws ApiException {
        Set<String> apps = apps();
        SharedPreferences.Editor editor = preferences.edit();
        if (allow) { ensureEligible(name); apps.add(name); editor.putString("pin:" + name, signer(name)); }
        else { apps.remove(name); editor.remove("pin:" + name); }
        if (!editor.putStringSet("apps", apps).commit()) throw new ApiException("storage_unavailable", "Could not save policy");
    }
    void operation(String name, boolean allow) {
        Set<String> operations = operations();
        if (allow) operations.add(name); else operations.remove(name);
        preferences.edit().putStringSet("operations", operations).apply();
    }
    void requireOperation(String method) throws ApiException {
        if (!operations().contains(method)) throw new ApiException("forbidden", "Operation is not enabled on the phone");
    }
    void requireApp(String name) throws ApiException {
        ensureEligible(name);
        if (!apps().contains(name) || !Policy.tokenEquals(preferences.getString("pin:" + name, ""), signer(name)))
            throw new ApiException("forbidden", "App is not allowed or its signing identity changed");
    }
    void ensureEligible(String name) throws ApiException {
        if (!Policy.validPackage(name) || Policy.protectedPackage(name, context.getPackageName())) throw new ApiException("protected_app", "Protected app");
        try {
            ApplicationInfo info = context.getPackageManager().getApplicationInfo(name, PackageManager.ApplicationInfoFlags.of(0));
            if ((info.flags & (ApplicationInfo.FLAG_SYSTEM | ApplicationInfo.FLAG_UPDATED_SYSTEM_APP)) != 0 || !info.enabled)
                throw new ApiException("protected_app", "System or disabled apps cannot be granted");
            Intent homes = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
            for (ResolveInfo home : context.getPackageManager().queryIntentActivities(homes, PackageManager.ResolveInfoFlags.of(0)))
                if (name.equals(home.activityInfo.packageName)) throw new ApiException("protected_app", "Launchers cannot be granted");
            if (context.getPackageManager().getLaunchIntentForPackage(name) == null) throw new ApiException("protected_app", "Only launchable user apps can be granted");
        } catch (PackageManager.NameNotFoundException missing) { throw new ApiException("app_unavailable", "App is not installed"); }
    }
    String signer(String name) throws ApiException {
        try {
            PackageInfo info = context.getPackageManager().getPackageInfo(name, PackageManager.PackageInfoFlags.of(PackageManager.GET_SIGNING_CERTIFICATES));
            if (info.signingInfo == null) throw new ApiException("app_unavailable", "No signing identity");
            List<String> hashes = new ArrayList<>();
            for (Signature certificate : info.signingInfo.getApkContentsSigners()) hashes.add(Policy.digest(certificate.toCharsString()));
            Collections.sort(hashes);
            return Policy.digest(String.join(":", hashes));
        } catch (PackageManager.NameNotFoundException missing) { throw new ApiException("app_unavailable", "App is not installed"); }
    }
    String identity(String name) throws ApiException {
        try {
            PackageInfo info = context.getPackageManager().getPackageInfo(name, PackageManager.PackageInfoFlags.of(0));
            return signer(name) + ":" + info.getLongVersionCode() + ":" + info.lastUpdateTime;
        } catch (PackageManager.NameNotFoundException missing) { throw new ApiException("app_unavailable", "App is not installed"); }
    }
    List<ResolveInfo> availableApps() {
        List<ResolveInfo> apps = new ArrayList<>();
        for (ResolveInfo info : context.getPackageManager().queryIntentActivities(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER), PackageManager.ResolveInfoFlags.of(0))) {
            try { ensureEligible(info.activityInfo.packageName); apps.add(info); } catch (ApiException excluded) { /* Local policy excludes this app. */ }
        }
        apps.sort((a, b) -> a.loadLabel(context.getPackageManager()).toString().compareToIgnoreCase(b.loadLabel(context.getPackageManager()).toString()));
        return apps;
    }
}
