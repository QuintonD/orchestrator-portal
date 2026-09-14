// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
package io.github.quintond.orchestrator.phonecontrol;

import android.app.Activity;
import android.hardware.biometrics.BiometricManager;
import android.hardware.biometrics.BiometricPrompt;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;

/** System strong-biometric authentication, never an accessibility-click approval surrogate. */
@android.annotation.SuppressLint("SetTextI18n") // Reviewed English-only alpha consent copy.
public final class ConsentActivity extends Activity {
    static final class Pending {
        final String nonce = UUID.randomUUID().toString();
        final String method;
        final String target;
        final String parameters;
        final String review;
        final CompletableFuture<Boolean> result = new CompletableFuture<>();
        final CancellationSignal cancellation = new CancellationSignal();
        volatile ConsentActivity activity;
        Pending(String method, String target, String parameters, String review) { this.method = method; this.target = target; this.parameters = parameters; this.review = review; }
        void cancel() {
            result.complete(false);
            cancellation.cancel();
            ConsentActivity current = activity;
            if (current != null) current.runOnUiThread(current::finish);
        }
    }
    private Pending pending;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
        getWindow().setHideOverlayWindows(true);
        PhoneService service = PhoneService.instance;
        pending = service == null ? null : service.consent;
        if (pending == null || !pending.nonce.equals(getIntent().getStringExtra("nonce")) || pending.result.isDone()) { finish(); return; }
        pending.activity = this;
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(28, 60, 28, 28);
        content.setOnApplyWindowInsetsListener((view, insets) -> {
            android.graphics.Insets safe = insets.getInsets(android.view.WindowInsets.Type.systemBars() | android.view.WindowInsets.Type.displayCutout());
            int padding = Math.round(16 * getResources().getDisplayMetrics().density);
            view.setPadding(safe.left + padding, safe.top + padding, safe.right + padding, safe.bottom + padding);
            return insets;
        });
        content.setAccessibilityDataSensitive(View.ACCESSIBILITY_DATA_SENSITIVE_YES);
        TextView title = new TextView(this);
        title.setText("Review one phone action"); title.setTextSize(24);
        content.addView(title);
        TextView detail = new TextView(this);
        detail.setText(pending.method.equals("draft.create")
                ? "Automation is paused. Confirm only if you intend this new draft in the reviewed folder.\n\n" + pending.review
                : pending.method.equals("document.replace")
                ? "Automation is paused. Confirm only if you intend this exact document replacement.\n\n" + pending.review
                : "Automation is paused. Confirm only if you intend this exact action. It may have consequences inside the selected app.\n\nApp: "
                + pending.target + "\n\n" + pending.review + "\n\nAfter confirmation, the original app must still match the observed window.");
        android.widget.ScrollView review = new android.widget.ScrollView(this);
        review.addView(detail);
        content.addView(review, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1));
        Button confirm = new Button(this);
        confirm.setText("Confirm this action with biometrics"); confirm.setFilterTouchesWhenObscured(true);
        confirm.setOnClickListener(view -> { confirm.setEnabled(false); authenticate(); });
        content.addView(confirm);
        Button cancel = new Button(this); cancel.setText("Deny action"); cancel.setOnClickListener(view -> pending.cancel()); content.addView(cancel);
        setContentView(content);
    }

    private void authenticate() {
        try {
            if (pending.result.isDone()) { finish(); return; }
            KeyStore store = KeyStore.getInstance("AndroidKeyStore");
            store.load(null);
            String alias = "phone-action-auth";
            if (!store.containsAlias(alias)) {
                KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
                generator.init(new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                        .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                        .setUserAuthenticationRequired(true).setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)
                        .setInvalidatedByBiometricEnrollment(true).build());
                generator.generateKey();
            }
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, (SecretKey) store.getKey(alias, null));
            BiometricPrompt prompt = new BiometricPrompt.Builder(this).setTitle("Authorize " + pending.method)
                    .setSubtitle(pending.target).setDescription("Authorize the single action shown in Phone Control.")
                    .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG).setConfirmationRequired(true)
                    .setNegativeButton("Deny", getMainExecutor(), (dialog, which) -> pending.cancel()).build();
            prompt.authenticate(new BiometricPrompt.CryptoObject(cipher), pending.cancellation, getMainExecutor(), new BiometricPrompt.AuthenticationCallback() {
                @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                    try {
                        if (pending.result.isDone() || result.getCryptoObject() == null || result.getCryptoObject().getCipher() != cipher) { pending.cancel(); return; }
                        cipher.doFinal((pending.nonce + pending.method + pending.target + pending.parameters).getBytes(StandardCharsets.UTF_8));
                        // Complete only after finishing the companion surface; execution rechecks target and session.
                        finish();
                        pending.result.complete(true);
                    } catch (Exception rejected) { pending.cancel(); }
                }
                @Override public void onAuthenticationError(int code, CharSequence message) { pending.cancel(); }
            });
        } catch (android.security.keystore.KeyPermanentlyInvalidatedException changedEnrollment) {
            // Reject this exact request. A later, newly reviewed action may create a fresh auth-per-use key.
            try { KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null); store.deleteEntry("phone-action-auth"); }
            catch (Exception unavailable) { /* Fail closed; no unauthenticated fallback key. */ }
            pending.cancel();
        } catch (Exception unavailable) { pending.cancel(); }
    }
    @Override protected void onDestroy() {
        if (pending != null && !pending.result.isDone()) pending.result.complete(false);
        if (pending != null) pending.activity = null;
        super.onDestroy();
    }
}
