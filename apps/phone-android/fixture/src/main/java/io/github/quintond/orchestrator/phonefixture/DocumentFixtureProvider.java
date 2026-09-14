// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
package io.github.quintond.orchestrator.phonefixture;

import android.database.Cursor;
import android.database.MatrixCursor;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.provider.DocumentsContract.Document;
import android.provider.DocumentsContract.Root;
import android.provider.DocumentsProvider;
import java.io.File;
import java.io.FileNotFoundException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Set;

/** Synthetic owner-selectable SAF test corpus. Never installed as part of the companion. */
public final class DocumentFixtureProvider extends DocumentsProvider {
    private static final String[] COLUMNS = {Document.COLUMN_DOCUMENT_ID, Document.COLUMN_DISPLAY_NAME, Document.COLUMN_MIME_TYPE, Document.COLUMN_FLAGS, Document.COLUMN_SIZE};
    private static final Set<String> FILES = Set.of("target", "sibling", "oversize", "malformed", "virtual", "binary");
    private static final Set<String> FOLDERS = Set.of("drafts", "alias", "alias-new");
    @Override public boolean onCreate() {
        try {
            File drafts = new File(getContext().getFilesDir(), "drafts");
            if (!drafts.isDirectory() && !drafts.mkdir()) return false;
            for (String id : FILES) {
                File file = file(id);
                if (!file.exists()) Files.write(file.toPath(), id.equals("malformed") ? new byte[]{(byte) 0xc3, 0x28}
                        : (id.equals("oversize") ? "x".repeat(2001) : "Synthetic " + id + "\r\nKeep café and 日本語.\n").getBytes(StandardCharsets.UTF_8));
            }
            return true;
        } catch (Exception failure) { return false; }
    }
    private File file(String id) throws FileNotFoundException {
        if (id.matches("(?:drafts|alias-new)/[0-9a-f-]{36}\\.draft\\.txt")) {
            if (id.startsWith("alias-new/")) return new File(getContext().getFilesDir(), "scope-target.txt");
            return new File(new File(getContext().getFilesDir(), "drafts"), id.substring(7));
        }
        if (!FILES.contains(id)) throw new FileNotFoundException("Unknown synthetic document");
        return new File(getContext().getFilesDir(), "scope-" + id + ".txt");
    }
    @Override public Cursor queryRoots(String[] projection) {
        MatrixCursor result = new MatrixCursor(projection == null ? new String[]{Root.COLUMN_ROOT_ID, Root.COLUMN_DOCUMENT_ID, Root.COLUMN_TITLE, Root.COLUMN_FLAGS, Root.COLUMN_MIME_TYPES} : projection);
        result.newRow().add(Root.COLUMN_ROOT_ID, "scope-qa").add(Root.COLUMN_DOCUMENT_ID, "root").add(Root.COLUMN_TITLE, "Phone scoped documents QA")
                .add(Root.COLUMN_FLAGS, Root.FLAG_LOCAL_ONLY | Root.FLAG_SUPPORTS_CREATE | Root.FLAG_SUPPORTS_IS_CHILD).add(Root.COLUMN_MIME_TYPES, "text/plain\napplication/octet-stream");
        return result;
    }
    private void row(MatrixCursor cursor, String id) throws FileNotFoundException {
        boolean root = id.equals("root") || FOLDERS.contains(id);
        if (!root) file(id);
        cursor.newRow().add(Document.COLUMN_DOCUMENT_ID, id).add(Document.COLUMN_DISPLAY_NAME, root ? (id.equals("root") ? "Synthetic document scope QA" : id) : id.contains("/") ? id.substring(id.indexOf('/') + 1) : id + ".txt")
                .add(Document.COLUMN_MIME_TYPE, root ? Document.MIME_TYPE_DIR : id.equals("binary") ? "application/octet-stream" : "text/plain")
                .add(Document.COLUMN_FLAGS, root ? Document.FLAG_DIR_SUPPORTS_CREATE : Document.FLAG_SUPPORTS_WRITE | (id.equals("virtual") ? Document.FLAG_VIRTUAL_DOCUMENT : 0))
                .add(Document.COLUMN_SIZE, root ? 0 : file(id).length());
    }
    @Override public Cursor queryDocument(String documentId, String[] projection) throws FileNotFoundException {
        MatrixCursor result = new MatrixCursor(projection == null ? COLUMNS : projection); row(result, documentId); return result;
    }
    @Override public Cursor queryChildDocuments(String parentDocumentId, String[] projection, String sortOrder) throws FileNotFoundException {
        MatrixCursor result = new MatrixCursor(projection == null ? COLUMNS : projection);
        if ("root".equals(parentDocumentId)) {
            for (String id : new java.util.TreeSet<>(FILES)) row(result, id);
            for (String id : new java.util.TreeSet<>(FOLDERS)) row(result, id);
        } else if (FOLDERS.contains(parentDocumentId)) {
            row(result, "target"); row(result, "sibling");
            if (parentDocumentId.equals("drafts")) {
                File directory = new File(getContext().getFilesDir(), "drafts");
                File[] files = directory.listFiles();
                if (files != null) for (File file : files) row(result, "drafts/" + file.getName());
            } else if (parentDocumentId.equals("alias-new")) {
                String alias = getContext().getSharedPreferences("folder-fixture", 0).getString("alias", null);
                if (alias != null) row(result, alias);
            }
        } else throw new FileNotFoundException("No children");
        return result;
    }
    @Override public boolean isChildDocument(String parentDocumentId, String documentId) {
        return parentDocumentId.equals("root") || FOLDERS.contains(parentDocumentId)
                && (Set.of("target", "sibling").contains(documentId) || documentId.startsWith(parentDocumentId + "/"));
    }
    @Override public String createDocument(String parentDocumentId, String mimeType, String displayName) throws FileNotFoundException {
        if (!FOLDERS.contains(parentDocumentId) || !"text/plain".equals(mimeType)
                || !displayName.matches("[0-9a-f-]{36}\\.draft\\.txt")) throw new FileNotFoundException("Unsupported fixture create");
        if (parentDocumentId.equals("alias")) return "target"; // Malicious existing-ID return, before any descriptor opens.
        String id = parentDocumentId + "/" + displayName;
        if (parentDocumentId.equals("alias-new")) {
            getContext().getSharedPreferences("folder-fixture", 0).edit().putString("alias", id).apply();
            return id; // New metadata identity aliases a nonempty existing file.
        }
        try {
            File target = file(id);
            if (!target.getParentFile().isDirectory() && !target.getParentFile().mkdirs()) throw new java.io.IOException("No fixture folder");
            if (!target.createNewFile()) throw new java.io.IOException("Fixture collision");
            return id;
        } catch (java.io.IOException failure) { throw new FileNotFoundException("Could not create synthetic draft"); }
    }
    @Override public ParcelFileDescriptor openDocument(String documentId, String mode, CancellationSignal signal) throws FileNotFoundException {
        if (!Set.of("r", "rw", "rwt", "w", "wt").contains(mode)) throw new FileNotFoundException("Unsupported mode");
        if (signal != null) signal.throwIfCanceled();
        return ParcelFileDescriptor.open(file(documentId), ParcelFileDescriptor.parseMode(mode));
    }
}
