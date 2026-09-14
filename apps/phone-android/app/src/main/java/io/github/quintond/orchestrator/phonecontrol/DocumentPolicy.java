// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
package io.github.quintond.orchestrator.phonecontrol;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.UriPermission;
import android.content.pm.ProviderInfo;
import android.database.Cursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.DocumentsContract;
import android.system.Os;
import android.system.OsConstants;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.json.JSONObject;

/** Local owner authority. Remote requests can resolve opaque handles, never introduce URIs. */
final class DocumentPolicy {
    static final DocumentWork WORK = new DocumentWork();
    static final String ADAPTER = "android.document.v1";
    private final Context context;
    private final SharedPreferences preferences;
    private final LocalPolicy apps;
    static final class Grant {
        final String resourceId, name, provider, identity;
        final Uri uri;
        final boolean write;
        Grant(String resourceId, Uri uri, String name, String provider, String identity, boolean write) {
            this.resourceId = resourceId; this.uri = uri; this.name = name; this.provider = provider; this.identity = identity; this.write = write;
        }
        JSONObject json() { return Json.object("resourceId", resourceId, "uri", uri.toString(), "name", name, "provider", provider, "identity", identity, "write", write); }
    }
    DocumentPolicy(Context context) {
        this.context = context.getApplicationContext();
        preferences = context.getSharedPreferences("phone-documents", Context.MODE_PRIVATE);
        apps = new LocalPolicy(context);
    }
    List<Grant> grants() {
        List<Grant> result = new ArrayList<>();
        for (String key : preferences.getAll().keySet()) {
            if (!DocumentText.resourceId(key)) continue;
            try { result.add(decode(key)); } catch (Exception invalid) { /* Corrupt grants never confer authority. */ }
        }
        result.sort((a, b) -> a.resourceId.compareTo(b.resourceId));
        return result;
    }
    private Grant decode(String id) throws Exception {
        JSONObject object = new JSONObject(preferences.getString(id, ""));
        return new Grant(id, Uri.parse(object.getString("uri")), object.getString("name"), object.getString("provider"), object.getString("identity"), object.getBoolean("write"));
    }
    private String provider(Uri uri) throws ApiException {
        if (!"content".equals(uri.getScheme()) || uri.getAuthority() == null || uri.getUserInfo() != null
                || uri.getQuery() != null || uri.getFragment() != null || DocumentsContract.isTreeUri(uri)
                || !DocumentsContract.isDocumentUri(context, uri)) throw new ApiException("unsupported_document", "Select one document, never a folder or arbitrary URI");
        ProviderInfo info = context.getPackageManager().resolveContentProvider(uri.getAuthority(), 0);
        if (info == null || !info.enabled || !info.exported || !info.grantUriPermissions
                || !"android.permission.MANAGE_DOCUMENTS".equals(info.readPermission)
                || !"android.permission.MANAGE_DOCUMENTS".equals(info.writePermission))
            throw new ApiException("unsupported_document", "Provider does not implement the supported document permission boundary");
        return info.packageName;
    }
    private String metadata(Uri uri, boolean write) throws ApiException {
        String[] projection = {DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                DocumentsContract.Document.COLUMN_MIME_TYPE, DocumentsContract.Document.COLUMN_FLAGS};
        try (Cursor row = context.getContentResolver().query(uri, projection, null, null, null)) {
            if (row == null || row.getCount() != 1 || !row.moveToFirst()
                    || !DocumentsContract.getDocumentId(uri).equals(row.getString(0)) || !"text/plain".equals(row.getString(2)))
                throw new ApiException("unsupported_document", "Only one exact text/plain document is supported");
            int flags = row.getInt(3);
            if ((flags & (DocumentsContract.Document.FLAG_VIRTUAL_DOCUMENT | DocumentsContract.Document.FLAG_PARTIAL)) != 0
                    || (write && (flags & DocumentsContract.Document.FLAG_SUPPORTS_WRITE) == 0))
                throw new ApiException("unsupported_document", "Virtual, partial, or non-writable documents are unsupported");
            String name = row.getString(1);
            if (!DocumentText.reviewName(name)) throw new ApiException("unsupported_document", "Document name contains unsupported control characters or exceeds the review limit");
            return name;
        } catch (SecurityException denied) { throw new ApiException("document_unavailable", "Document permission is unavailable"); }
    }
    Grant inspect(Uri uri, int flags) throws Exception {
        if ((flags & Intent.FLAG_GRANT_READ_URI_PERMISSION) == 0 || (flags & Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION) == 0)
            throw new ApiException("unsupported_document", "Provider must offer persistent read permission");
        String provider = provider(uri);
        boolean write = (flags & Intent.FLAG_GRANT_WRITE_URI_PERMISSION) != 0;
        String identity = apps.identity(provider);
        String name = metadata(uri, write);
        readUri(uri); // Validate exact encoding, size and ordinary file descriptor before owner trust.
        if (!identity.equals(apps.identity(provider))) throw new ApiException("document_unavailable", "Provider changed during selection");
        return new Grant(UUID.randomUUID().toString(), uri, name, provider, identity, write);
    }
    void accept(Grant selected, boolean write, DocumentWork.Ticket<?> ticket) throws Exception {
        if (grants().size() >= 16) throw new ApiException("forbidden", "Revoke a document before granting another (maximum 16)");
        for (Grant existing : grants()) if (existing.uri.equals(selected.uri)) throw new ApiException("forbidden", "This document already has an owner grant");
        if (write && !selected.write) throw new ApiException("forbidden", "Provider did not offer write permission");
        if (!selected.provider.equals(provider(selected.uri)) || !selected.identity.equals(apps.identity(selected.provider)))
            throw new ApiException("document_unavailable", "Provider identity changed; select the document again");
        metadata(selected.uri, write);
        ticket.check();
        int flags = Intent.FLAG_GRANT_READ_URI_PERMISSION | (write ? Intent.FLAG_GRANT_WRITE_URI_PERMISSION : 0);
        context.getContentResolver().takePersistableUriPermission(selected.uri, flags);
        ticket.check();
        Grant grant = new Grant(selected.resourceId, selected.uri, selected.name, selected.provider, selected.identity, write);
        if (!preferences.edit().putString(grant.resourceId, grant.json().toString()).commit()) {
            context.getContentResolver().releasePersistableUriPermission(selected.uri, flags);
            throw new ApiException("storage_unavailable", "Could not save the document grant");
        }
    }
    void revoke(String id) throws ApiException {
        Grant grant;
        try { grant = decode(id); } catch (Exception absent) { return; }
        // Removing local authority is immediate and never waits for an unresponsive provider.
        if (!preferences.edit().remove(id).commit()) throw new ApiException("storage_unavailable", "Could not revoke the document grant");
        WORK.afterIdle(() -> {
            // If cleanup was delayed by a provider, a later grant must retain its Android permission.
            if (grants().stream().anyMatch(other -> other.uri.equals(grant.uri))) return;
            try { context.getContentResolver().releasePersistableUriPermission(grant.uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION | (grant.write ? Intent.FLAG_GRANT_WRITE_URI_PERMISSION : 0)); }
            catch (SecurityException absent) { /* Permission already revoked. Local authority is gone either way. */ }
        });
    }
    Grant requireLocal(String id, boolean write) throws ApiException {
        if (!DocumentText.resourceId(id)) throw new ApiException("invalid_request", "Invalid document resourceId");
        Grant grant;
        try { grant = decode(id); } catch (Exception absent) { throw new ApiException("forbidden", "Document has no local owner grant"); }
        if (write && !grant.write) throw new ApiException("forbidden", "Owner did not grant document replacement");
        return grant;
    }
    Grant require(String id, boolean write) throws ApiException {
        Grant grant = requireLocal(id, write);
        if (!grant.provider.equals(provider(grant.uri)) || !grant.identity.equals(apps.identity(grant.provider)))
            throw new ApiException("document_unavailable", "Document provider identity changed; owner must grant it again");
        boolean persisted = false;
        for (UriPermission permission : context.getContentResolver().getPersistedUriPermissions()) {
            if (permission.getUri().equals(grant.uri) && permission.isReadPermission() && (!write || permission.isWritePermission())) persisted = true;
        }
        if (!persisted) throw new ApiException("document_unavailable", "Persistent document permission was revoked");
        if (!grant.name.equals(metadata(grant.uri, write))) throw new ApiException("document_unavailable", "Document name changed; owner must select it again");
        return grant;
    }
    String read(Grant grant) throws Exception { return readUri(grant.uri); }
    private String readUri(Uri uri) throws Exception {
        try (ParcelFileDescriptor file = context.getContentResolver().openFileDescriptor(uri, "r")) {
            regular(file);
            try (FileInputStream stream = new ParcelFileDescriptor.AutoCloseInputStream(file.dup())) { return DocumentText.read(stream); }
        }
    }
    private static void regular(ParcelFileDescriptor file) throws Exception {
        if (file == null || !OsConstants.S_ISREG(Os.fstat(file.getFileDescriptor()).st_mode))
            throw new ApiException("unsupported_document", "Only providers offering ordinary seekable document files are supported");
    }
    interface Authority { void check() throws Exception; }
    void replace(Grant grant, String revision, String text, DocumentWork.Ticket<?> ticket, Authority authority) throws Exception {
        authority.check(); ticket.beforeWrite();
        // Opening rw is conservatively a write attempt: a provider may have side effects even on failure.
        try (ParcelFileDescriptor file = context.getContentResolver().openFileDescriptor(grant.uri, "rw")) {
            regular(file);
            try (FileInputStream input = new ParcelFileDescriptor.AutoCloseInputStream(file.dup())) {
                String current = DocumentText.read(input);
                if (!revision.equals(Policy.digest(current))) throw new ApiException("unknown_action_state", "Document changed before replacement; provider write access was already opened");
                authority.check(); ticket.check();
                // SAF has no atomic compare-and-swap. This exact-descriptor check only narrows the race.
                Os.lseek(file.getFileDescriptor(), 0, OsConstants.SEEK_SET);
                try (FileOutputStream output = new ParcelFileDescriptor.AutoCloseOutputStream(file.dup())) {
                    output.write(DocumentText.encode(text));
                    output.getChannel().truncate(DocumentText.encode(text).length);
                    output.getFD().sync();
                }
            }
        } catch (Exception failure) {
            throw new ApiException("unknown_action_state", "Document replacement may have changed content; read it before deciding what happened and do not replay automatically");
        }
    }
}
