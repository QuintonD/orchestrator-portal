package io.github.quintond.orchestrator;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.ColorStateList;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Insets;
import android.graphics.Typeface;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.inputmethod.InputMethodManager;
import android.webkit.CookieManager;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.RenderProcessGoneDetail;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONObject;
import java.net.HttpURLConnection;
import java.net.URL;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Private gateway client. No native bridge, provider credentials or runtime execution. */
public final class MainActivity extends Activity {
    private static final int PICK_TEXT = 42;
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private SharedPreferences preferences;
    private LinearLayout root;
    private WebView webView;
    private String origin = "";
    private ValueCallback<Uri[]> fileCallback;
    private int background;
    private int foreground;
    private int generation;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        preferences = getSharedPreferences("gateway", MODE_PRIVATE);
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(0, this::handleBack);
        }
        origin = preferences.getString("origin", "");
        if (origin.isEmpty()) showSetup(""); else openPortal();
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    private void newRoot() {
        boolean dark = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        background = Color.parseColor(dark ? "#111111" : "#F7F6F2");
        foreground = Color.parseColor(dark ? "#F4F3EF" : "#151515");
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(background);
        setContentView(root);
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            int lightBars = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
            getWindow().getInsetsController().setSystemBarsAppearance(dark ? 0 : lightBars, lightBars);
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return WindowInsets.CONSUMED;
            });
        } else {
            root.setFitsSystemWindows(true);
        }
    }

    private TextView text(String value, int size) {
        TextView text = new TextView(this);
        text.setText(value);
        text.setTextSize(size);
        text.setTextColor(foreground);
        text.setPadding(0, dp(8), 0, dp(8));
        return text;
    }

    private Button button(String title, Runnable action) {
        Button button = new Button(this);
        button.setText(title);
        button.setTextSize(14);
        button.setAllCaps(false);
        button.setTextColor(foreground);
        button.setBackgroundTintList(ColorStateList.valueOf(Color.parseColor(background == Color.parseColor("#111111") ? "#292929" : "#E8E7E4")));
        button.setMinHeight(dp(48));
        button.setOnClickListener(view -> action.run());
        return button;
    }

    private LinearLayout panel() {
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(24), dp(24), dp(24), dp(24));
        scroll.addView(content, new ScrollView.LayoutParams(-1, -2));
        root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        return content;
    }

    private void showSetup(String message) {
        generation++;
        destroyWebView();
        newRoot();
        LinearLayout content = panel();
        content.addView(text("ORCHESTRATOR  /  BETA", 12));
        TextView heading = text("Your assistants.\nYour gateway.", 32);
        heading.setTypeface(null, Typeface.NORMAL);
        content.addView(heading);
        content.addView(text("Connect to Orchestrator running on your computer. Your computer keeps the workspace and runs your connected assistants.", 16));
        content.addView(text("Gateway address", 14));
        EditText address = new EditText(this);
        address.setTextColor(foreground);
        address.setHintTextColor(Color.GRAY);
        address.setTextSize(16);
        address.setMinHeight(dp(56));
        address.setSingleLine(true);
        address.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        address.setHint("https://your-computer.tailnet.ts.net");
        address.setContentDescription("Gateway address");
        address.setText(origin);
        address.setSelectAllOnFocus(true);
        content.addView(address);
        TextView status = text(message, 14);
        status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        content.addView(status);
        Button connect = button("Connect to gateway", () -> {});
        connect.setOnClickListener(view -> {
            final String candidate;
            try { candidate = GatewayUrl.normalize(address.getText().toString()); }
            catch (IllegalArgumentException exception) { status.setText(exception.getMessage()); return; }
            connect.setEnabled(false);
            status.setText(R.string.checking_gateway);
            ((InputMethodManager) getSystemService(INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(address.getWindowToken(), 0);
            final int attempt = ++generation;
            network.execute(() -> {
                String failure = checkGateway(candidate);
                runOnUiThread(() -> {
                    if (isDestroyed() || generation != attempt) return;
                    connect.setEnabled(true);
                    if (failure != null) { status.setText(failure); return; }
                    Runnable accept = () -> {
                        origin = candidate;
                        preferences.edit().putString("origin", origin).apply();
                        openPortal();
                    };
                    if (!origin.isEmpty() && !origin.equals(candidate)) {
                        clearLocalSession(accept);
                    } else accept.run();
                });
            });
        });
        content.addView(connect);
        content.addView(text("Only connect to a gateway you control. You’ll enter your workspace passphrase on the next screen.", 14));
        content.addView(text("Testing over USB", 20));
        content.addView(text("Start the gateway on your computer, enable USB debugging, and run:\n\nadb reverse tcp:4400 tcp:4400\n\nThen use http://127.0.0.1:4400 here. Reconnect USB forwarding after unplugging or restarting.", 15));
        content.addView(text("Using Wi-Fi or mobile data", 20));
        content.addView(text("Use private HTTPS access, such as Tailscale Serve, with both devices on your tailnet. The computer and gateway must stay on. Public or local-network HTTP addresses are blocked.", 15));
        if (!origin.isEmpty()) {
            content.addView(button("Return to workspace", this::openPortal));
            content.addView(button("Forget this gateway", () -> new AlertDialog.Builder(this)
                    .setTitle("Forget this gateway?")
                    .setMessage("This clears the address, cookies and cached portal data on this phone. Gateway data and running assistants remain on your computer. Sign out in Settings first to revoke the server session.")
                    .setNegativeButton("Cancel", null)
                    .setPositiveButton("Forget", (dialog, which) -> clearLocalSession(() -> {
                        preferences.edit().clear().apply(); origin = ""; showSetup("");
                    })).show()));
        }
    }

    private String checkGateway(String candidate) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(candidate + "/healthz").openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(6000);
            connection.setReadTimeout(6000);
            if (connection.getResponseCode() != 200) return "This address did not return a healthy Orchestrator gateway. Check the address and gateway process.";
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            try (InputStream stream = connection.getInputStream()) {
                byte[] chunk = new byte[1024];
                int count;
                while (bytes.size() <= 4096 && (count = stream.read(chunk, 0, Math.min(chunk.length, 4097 - bytes.size()))) != -1) bytes.write(chunk, 0, count);
            }
            byte[] response = bytes.toByteArray();
            if (response.length > 4096) return "This address did not return an Orchestrator health response.";
            JSONObject json = new JSONObject(new String(response, StandardCharsets.UTF_8));
            if (!json.optString("status").equals("ok") || !json.has("version")) return "This address did not return an Orchestrator health response.";
            return null;
        } catch (Exception exception) {
            // Exception messages may contain a URL or gateway response. Keep diagnostics local and generic.
            return "Couldn’t reach the gateway securely. Check that it is running, then check USB forwarding or your private HTTPS connection and certificate.";
        } finally { if (connection != null) connection.disconnect(); }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void openPortal() {
        generation++;
        destroyWebView();
        newRoot();
        LinearLayout toolbar = new LinearLayout(this);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setPadding(dp(12), 0, dp(8), 0);
        TextView label = text(Uri.parse(origin).getHost(), 12);
        label.setMaxLines(1);
        label.setEllipsize(android.text.TextUtils.TruncateAt.END);
        label.setContentDescription("Connected gateway " + origin);
        toolbar.addView(label, new LinearLayout.LayoutParams(0, -2, 1));
        toolbar.addView(button("Gateway", () -> new AlertDialog.Builder(this)
                .setTitle("Gateway")
                .setMessage(origin + "\n\nOpening connection settings or reloading clears unsent drafts. Running work stays on your gateway.")
                .setNegativeButton("Cancel", null)
                .setNeutralButton("Connection settings", (dialog, which) -> showSetup(""))
                .setPositiveButton("Reload portal", (dialog, which) -> openPortal()).show()));
        root.addView(toolbar);
        ProgressBar progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        root.addView(progress, new LinearLayout.LayoutParams(-1, dp(2)));
        webView = new WebView(this);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        webView.setBackgroundColor(background);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView view, int value) {
                progress.setProgress(value);
                progress.setVisibility(value == 100 ? View.GONE : View.VISIBLE);
            }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] { "text/*", "application/json" });
                try { startActivityForResult(intent, PICK_TEXT); }
                catch (ActivityNotFoundException exception) { fileCallback.onReceiveValue(null); fileCallback = null; }
                return true;
            }
            @Override public boolean onCreateWindow(WebView view, boolean dialog, boolean gesture, android.os.Message result) {
                // Popups never receive a bridge or session. Only an explicit user gesture can open a browser.
                if (!gesture) return false;
                WebView popup = new WebView(MainActivity.this);
                popup.setWebViewClient(new WebViewClient() {
                    @Override public boolean shouldOverrideUrlLoading(WebView child, WebResourceRequest request) {
                        openExternal(request.getUrl().toString()); child.destroy(); return true;
                    }
                });
                ((WebView.WebViewTransport) result.obj).setWebView(popup);
                result.sendToTarget();
                return true;
            }
        });
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (GatewayUrl.sameOrigin(origin, request.getUrl().toString())) return false;
                if (request.isForMainFrame() && request.hasGesture()) openExternal(request.getUrl().toString());
                return true;
            }
            @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.cancel();
                showLoadError("The gateway certificate could not be verified. Check your private HTTPS setup. Certificate errors cannot be bypassed.");
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showLoadError("The gateway is unavailable. Keep your computer awake and check USB forwarding or your private network.");
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame()) showLoadError("The gateway could not load the portal (HTTP " + response.getStatusCode() + "). Check the gateway, then reconnect.");
            }
            @Override public void onPageFinished(WebView view, String url) { CookieManager.getInstance().flush(); }
            @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                showLoadError("Android closed the portal view. Reconnect to inspect your workspace; no work will be resent.");
                return true;
            }
        });
        root.addView(webView, new LinearLayout.LayoutParams(-1, 0, 1));
        webView.loadUrl(origin + "/");
    }

    private void showLoadError(String message) {
        if (isDestroyed() || webView == null) return;
        // Leave the WebView callback before destroying it.
        root.post(() -> { if (!isDestroyed()) showSetup(message); });
    }

    private void openExternal(String target) {
        Uri uri = Uri.parse(target);
        if (!"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null) {
            Toast.makeText(this, "Only HTTPS links can open outside the gateway.", Toast.LENGTH_LONG).show(); return;
        }
        try { startActivity(new Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE)); }
        catch (ActivityNotFoundException exception) { Toast.makeText(this, "Install a browser to open this link.", Toast.LENGTH_LONG).show(); }
    }

    private void clearLocalSession(Runnable after) {
        CookieManager.getInstance().removeAllCookies(ignored -> {
            CookieManager.getInstance().flush();
            WebStorage.getInstance().deleteAllData();
            WebView cleaner = new WebView(this); cleaner.clearCache(true); cleaner.destroy();
            after.run();
        });
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == PICK_TEXT && fileCallback != null) {
            Uri uri = resultCode == RESULT_OK && data != null ? data.getData() : null;
            // Only the document provider's temporary, user-selected content grant is exposed.
            fileCallback.onReceiveValue(uri != null && "content".equals(uri.getScheme()) ? new Uri[]{uri} : null);
            fileCallback = null;
        }
    }

    private void handleBack() {
        if (webView == null) { if (origin.isEmpty()) finish(); else openPortal(); return; }
        webView.evaluateJavascript("(() => { const dialogs = Array.from(document.querySelectorAll('dialog[open]')); const top = dialogs[dialogs.length - 1]; const d = top ? top.querySelector('[aria-label=\"Close dialog\"]') : document.querySelector('[role=\"dialog\"] [aria-label=\"Close\"]'); if(d){d.click();return true;} const c = document.querySelector('[aria-label=\"Close navigation\"]'); if(c){c.click();return true;} return false; })()", handled -> {
            if (webView == null || "true".equals(handled)) return;
            if (webView.canGoBack()) webView.goBack(); else moveTaskToBack(true);
        });
    }

    @SuppressWarnings("deprecation")
    @Override public void onBackPressed() { handleBack(); }

    @Override public void onConfigurationChanged(Configuration config) {
        super.onConfigurationChanged(config);
        // Preserve the WebView and drafts through rotation. CSS reflows to the available viewport.
    }

    @Override protected void onPause() {
        super.onPause();
        if (webView != null) { webView.onPause(); CookieManager.getInstance().flush(); }
    }

    @Override protected void onResume() { super.onResume(); if (webView != null) webView.onResume(); }

    @Override public void onWindowFocusChanged(boolean focused) {
        super.onWindowFocusChanged(focused);
        if (focused && Build.VERSION.SDK_INT >= 30) {
            int lightBars = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
            getWindow().getInsetsController().setSystemBarsAppearance(background == Color.parseColor("#111111") ? 0 : lightBars, lightBars);
        }
    }

    private void destroyWebView() {
        if (fileCallback != null) { fileCallback.onReceiveValue(null); fileCallback = null; }
        if (webView != null) { webView.stopLoading(); webView.destroy(); webView = null; }
    }

    @Override protected void onDestroy() { generation++; destroyWebView(); network.shutdownNow(); super.onDestroy(); }
}
