// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
package io.github.quintond.orchestrator.phonecontrol;

import java.util.Map;
import java.util.Objects;

/** Bounded metadata checks, not proof against a provider lying about backing storage. */
final class FolderDraftSafety {
    static final int MAX_CHILDREN = 256;
    record Entry(String name, String mime) { }
    static void add(Map<String, Entry> entries, String id, String name, String mime) throws ApiException {
        if (entries.size() >= MAX_CHILDREN || id == null || id.isEmpty() || id.length() > 4096
                || name == null || name.length() > 4096 || mime == null || mime.length() > 256
                || entries.putIfAbsent(id, new Entry(name, mime)) != null)
            throw new ApiException("document_unavailable", "Folder listing is invalid, duplicated, or exceeds 256 entries");
    }
    static void planned(Map<String, Entry> before, String name) throws ApiException {
        if (!name.matches("[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.draft\\.txt")
                || before.size() >= MAX_CHILDREN || before.values().stream().anyMatch(entry -> entry.name().equals(name)))
            throw new ApiException("document_unavailable", "Folder is full or generated draft name collides");
    }
    static void created(Map<String, Entry> before, Map<String, Entry> after, String id, String name) throws ApiException {
        if (before.containsKey(id) || after.size() != before.size() + 1
                || !Objects.equals(after.get(id), new Entry(name, "text/plain"))
                || before.entrySet().stream().anyMatch(entry -> !Objects.equals(after.get(entry.getKey()), entry.getValue()))
                || after.values().stream().filter(entry -> entry.name().equals(name)).count() != 1)
            throw new ApiException("unknown_action_state", "Provider did not report one unique new direct child draft");
    }
}
