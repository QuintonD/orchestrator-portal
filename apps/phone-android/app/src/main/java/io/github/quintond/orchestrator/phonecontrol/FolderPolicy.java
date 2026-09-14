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
final class FolderPolicy {
    static final DocumentWork WORK = DocumentPolicy.WORK;
    static final String ADAPTER = "android.folder-drafts.v1";
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
    FolderPolicy(Context context) {
        this.context = context.getApplicationContext();
        preferences = context.getSharedPreferences("phone-draft-folders", Context.MODE_PRIVATE);
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
                || uri.getQuery() != null || uri.getFragment() != null || !DocumentsContract.isTreeUri(uri)
                || !uri.equals(DocumentsContract.buildTreeDocumentUri(uri.getAuthority(), DocumentsContract.getTreeDocumentId(uri))))
            throw new ApiException("unsupported_document", "Select one folder using the Android folder picker");
        ProviderInfo info = context.getPackageManager().resolveContentProvider(uri.getAuthority(), 0);
        if (info == null || !info.enabled || !info.exported || !info.grantUriPermissions
                || !"android.permission.MANAGE_DOCUMENTS".equals(info.readPermission)
                || !"android.permission.MANAGE_DOCUMENTS".equals(info.writePermission))
            throw new ApiException("unsupported_document", "Provider does not implement the supported folder permission boundary");
        return info.packageName;
    }
    private Uri folder(Uri tree) { return DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree)); }
    private String metadata(Uri tree, boolean ignored) throws ApiException {
        String[] projection = {DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                DocumentsContract.Document.COLUMN_MIME_TYPE, DocumentsContract.Document.COLUMN_FLAGS};
        try (Cursor row = context.getContentResolver().query(folder(tree), projection, null, null, null)) {
            if (row == null || row.getCount() != 1 || !row.moveToFirst()
                    || !DocumentsContract.getTreeDocumentId(tree).equals(row.getString(0))
                    || !DocumentsContract.Document.MIME_TYPE_DIR.equals(row.getString(2))
                    || (row.getInt(3) & DocumentsContract.Document.FLAG_DIR_SUPPORTS_CREATE) == 0
                    || (row.getInt(3) & (DocumentsContract.Document.FLAG_VIRTUAL_DOCUMENT | DocumentsContract.Document.FLAG_PARTIAL)) != 0
                    || !DocumentText.reviewName(row.getString(1)))
                throw new ApiException("unsupported_document", "Select an ordinary folder supporting draft creation and a reviewable name");
            return row.getString(1);
        } catch (SecurityException denied) { throw new ApiException("document_unavailable", "Folder permission is unavailable"); }
    }
    Grant inspect(Uri uri, int flags) throws Exception {
        if ((flags & Intent.FLAG_GRANT_READ_URI_PERMISSION) == 0 || (flags & Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION) == 0
                || (flags & Intent.FLAG_GRANT_WRITE_URI_PERMISSION) == 0)
            throw new ApiException("unsupported_document", "Provider must offer persistent folder read and write permission");
        String provider = provider(uri);
        boolean write = (flags & Intent.FLAG_GRANT_WRITE_URI_PERMISSION) != 0;
        String identity = apps.identity(provider);
        String name = metadata(uri, write);
        children(uri); // Metadata only: never read existing child content.
        if (!identity.equals(apps.identity(provider))) throw new ApiException("document_unavailable", "Provider changed during selection");
        return new Grant(UUID.randomUUID().toString(), uri, name, provider, identity, write);
    }
    void accept(Grant selected, boolean write, DocumentWork.Ticket<?> ticket) throws Exception {
        if (grants().size() >= 16) throw new ApiException("forbidden", "Revoke a folder before granting another (maximum 16)");
        for (Grant existing : grants()) if (existing.uri.equals(selected.uri)) throw new ApiException("forbidden", "This folder already has an owner grant");
        if (write && !selected.write) throw new ApiException("forbidden", "Provider did not offer write permission");
        if (!selected.provider.equals(provider(selected.uri)) || !selected.identity.equals(apps.identity(selected.provider)))
            throw new ApiException("document_unavailable", "Provider identity changed; select the folder again");
        metadata(selected.uri, write);
        ticket.check();
        int flags = Intent.FLAG_GRANT_READ_URI_PERMISSION | (write ? Intent.FLAG_GRANT_WRITE_URI_PERMISSION : 0);
        context.getContentResolver().takePersistableUriPermission(selected.uri, flags);
        ticket.check();
        Grant grant = new Grant(selected.resourceId, selected.uri, selected.name, selected.provider, selected.identity, write);
        if (!preferences.edit().putString(grant.resourceId, grant.json().toString()).commit()) {
            context.getContentResolver().releasePersistableUriPermission(selected.uri, flags);
            throw new ApiException("storage_unavailable", "Could not save the folder grant");
        }
    }
    void revoke(String id) throws ApiException {
        Grant grant;
        try { grant = decode(id); } catch (Exception absent) { return; }
        // Removing local authority is immediate and never waits for an unresponsive provider.
        if (!preferences.edit().remove(id).commit()) throw new ApiException("storage_unavailable", "Could not revoke the folder grant");
        WORK.afterIdle(() -> {
            // If cleanup was delayed by a provider, a later grant must retain its Android permission.
            if (grants().stream().anyMatch(other -> other.uri.equals(grant.uri))) return;
            try { context.getContentResolver().releasePersistableUriPermission(grant.uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION | (grant.write ? Intent.FLAG_GRANT_WRITE_URI_PERMISSION : 0)); }
            catch (SecurityException absent) { /* Permission already revoked. Local authority is gone either way. */ }
        });
    }
    Grant requireLocal(String id, boolean write) throws ApiException {
        if (!DocumentText.resourceId(id)) throw new ApiException("invalid_request", "Invalid folder resourceId");
        Grant grant;
        try { grant = decode(id); } catch (Exception absent) { throw new ApiException("forbidden", "Folder has no local owner grant"); }
        if (write && !grant.write) throw new ApiException("forbidden", "Owner did not grant new draft creation");
        return grant;
    }
    Grant require(String id, boolean write) throws ApiException {
        Grant grant = requireLocal(id, write);
        if (!grant.provider.equals(provider(grant.uri)) || !grant.identity.equals(apps.identity(grant.provider)))
            throw new ApiException("document_unavailable", "Folder provider identity changed; owner must grant it again");
        boolean persisted = false;
        for (UriPermission permission : context.getContentResolver().getPersistedUriPermissions()) {
            if (permission.getUri().equals(grant.uri) && permission.isReadPermission() && (!write || permission.isWritePermission())) persisted = true;
        }
        if (!persisted) throw new ApiException("document_unavailable", "Persistent folder permission was revoked");
        if (!grant.name.equals(metadata(grant.uri, write))) throw new ApiException("document_unavailable", "Folder name changed; owner must select it again");
        return grant;
    }
    private java.util.Map<String, FolderDraftSafety.Entry> children(Uri tree) throws Exception {
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
        java.util.Map<String, FolderDraftSafety.Entry> result = new java.util.HashMap<>();
        String[] columns = {DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                DocumentsContract.Document.COLUMN_MIME_TYPE};
        try (Cursor rows = context.getContentResolver().query(children, columns, null, null, null)) {
            if (rows == null || rows.getExtras().getBoolean(DocumentsContract.EXTRA_LOADING, false))
                throw new ApiException("document_unavailable", "Folder listing is unavailable or still loading");
            while (rows.moveToNext()) FolderDraftSafety.add(result, rows.getString(0), rows.getString(1), rows.getString(2));
        }
        return result;
    }
    private void verifyNew(Grant grant, Uri created, String name, java.util.Map<String, FolderDraftSafety.Entry> before) throws Exception {
        if (created == null || !grant.uri.getAuthority().equals(created.getAuthority())
                || !created.equals(DocumentsContract.buildDocumentUriUsingTree(grant.uri, DocumentsContract.getDocumentId(created))))
            throw new ApiException("unknown_action_state", "Provider returned an unexpected created document URI");
        String id = DocumentsContract.getDocumentId(created);
        FolderDraftSafety.created(before, children(grant.uri), id, name);
        String[] columns = {DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                DocumentsContract.Document.COLUMN_MIME_TYPE, DocumentsContract.Document.COLUMN_FLAGS};
        try (Cursor row = context.getContentResolver().query(created, columns, null, null, null)) {
            if (row == null || row.getCount() != 1 || !row.moveToFirst() || !id.equals(row.getString(0))
                    || !name.equals(row.getString(1)) || !"text/plain".equals(row.getString(2))
                    || (row.getInt(3) & DocumentsContract.Document.FLAG_SUPPORTS_WRITE) == 0
                    || (row.getInt(3) & (DocumentsContract.Document.FLAG_VIRTUAL_DOCUMENT | DocumentsContract.Document.FLAG_PARTIAL)) != 0)
                throw new ApiException("unknown_action_state", "Created draft identity could not be verified");
        }
    }
    void create(Grant grant, String name, String text, DocumentWork.Ticket<?> ticket, DocumentPolicy.Authority authority) throws Exception {
        byte[] bytes = DocumentText.encode(text);
        java.util.Map<String, FolderDraftSafety.Entry> before = children(grant.uri);
        FolderDraftSafety.planned(before, name);
        authority.check(); ticket.beforeWrite();
        // createDocument is already an effect. Never delete for rollback or replay on uncertainty.
        try {
            Uri created = DocumentsContract.createDocument(context.getContentResolver(), folder(grant.uri), "text/plain", name);
            authority.check(); verifyNew(grant, created, name, before); authority.check();
            // rw deliberately does not truncate. A nonempty returned descriptor is never written.
            try (ParcelFileDescriptor file = context.getContentResolver().openFileDescriptor(created, "rw")) {
                regularEmpty(file);
                verifyNew(grant, created, name, before); authority.check(); ticket.check();
                regularEmpty(file);
                try (FileOutputStream output = new ParcelFileDescriptor.AutoCloseOutputStream(file.dup())) {
                    output.write(bytes); output.getFD().sync();
                }
            }
            authority.check(); verifyNew(grant, created, name, before);
            try (ParcelFileDescriptor file = context.getContentResolver().openFileDescriptor(created, "r")) {
                if (file == null || !OsConstants.S_ISREG(Os.fstat(file.getFileDescriptor()).st_mode))
                    throw new ApiException("unknown_action_state", "Draft verification requires an ordinary file");
                try (FileInputStream input = new ParcelFileDescriptor.AutoCloseInputStream(file.dup())) {
                    if (!text.equals(DocumentText.read(input))) throw new ApiException("unknown_action_state", "Created draft text differs");
                }
            }
            verifyNew(grant, created, name, before); authority.check(); ticket.check();
        } catch (Exception uncertain) {
            throw new ApiException("unknown_action_state", "Draft creation may have changed the folder; inspect it on the phone and do not retry automatically");
        }
    }
    private static void regularEmpty(ParcelFileDescriptor file) throws Exception {
        if (file == null) throw new ApiException("unknown_action_state", "Provider returned no draft descriptor");
        android.system.StructStat stat = Os.fstat(file.getFileDescriptor());
        if (!OsConstants.S_ISREG(stat.st_mode) || stat.st_size != 0 || stat.st_nlink != 1)
            throw new ApiException("unknown_action_state", "Provider must return a new empty ordinary draft file");
    }
}
