// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
package io.github.quintond.orchestrator.phonecontrol;

import java.util.HashMap;
import java.util.Map;
import org.junit.Test;
import static org.junit.Assert.*;

public final class FolderDraftSafetyTest {
    private final String name = "12345678-1234-4234-8234-123456789012.draft.txt";
    private Map<String, FolderDraftSafety.Entry> existing() {
        return new HashMap<>(Map.of("old", new FolderDraftSafety.Entry("old.txt", "text/plain")));
    }
    @Test public void acceptsOneUniqueDirectChildWithoutChangingExistingMetadata() throws Exception {
        var before = existing(); var after = existing();
        FolderDraftSafety.planned(before, name);
        FolderDraftSafety.add(after, "new", name, "text/plain");
        FolderDraftSafety.created(before, after, "new", name);
    }
    @Test public void rejectsExistingIdAndRenamedOldChild() throws Exception {
        var before = existing(); var after = existing();
        after.put("old", new FolderDraftSafety.Entry(name, "text/plain"));
        assertThrows(ApiException.class, () -> FolderDraftSafety.created(before, after, "old", name));
        after.put("new", new FolderDraftSafety.Entry(name, "text/plain"));
        assertThrows(ApiException.class, () -> FolderDraftSafety.created(before, after, "new", name));
    }
    @Test public void rejectsMissingChildWrongNameTypeAndUnexpectedSibling() throws Exception {
        var before = existing(); var after = existing();
        assertThrows(ApiException.class, () -> FolderDraftSafety.created(before, after, "new", name));
        after.put("new", new FolderDraftSafety.Entry("wrong", "text/plain"));
        assertThrows(ApiException.class, () -> FolderDraftSafety.created(before, after, "new", name));
        after.put("new", new FolderDraftSafety.Entry(name, "application/octet-stream"));
        assertThrows(ApiException.class, () -> FolderDraftSafety.created(before, after, "new", name));
        after.put("new", new FolderDraftSafety.Entry(name, "text/plain"));
        after.put("extra", new FolderDraftSafety.Entry("extra", "text/plain"));
        assertThrows(ApiException.class, () -> FolderDraftSafety.created(before, after, "new", name));
    }
    @Test public void rejectsCollisionInvalidGeneratedNameAndDuplicateListingIds() throws Exception {
        var before = existing();
        assertThrows(ApiException.class, () -> FolderDraftSafety.planned(before, "../existing.txt"));
        assertThrows(ApiException.class, () -> FolderDraftSafety.add(before, "old", "another", "text/plain"));
        before.put("collision", new FolderDraftSafety.Entry(name, "text/plain"));
        assertThrows(ApiException.class, () -> FolderDraftSafety.planned(before, name));
    }
    @Test public void leavesCapacityForOneCreatedChildAndBoundsUntrustedListing() throws Exception {
        var before = new HashMap<String, FolderDraftSafety.Entry>();
        for (int i = 0; i < 255; i++) FolderDraftSafety.add(before, "id" + i, "name" + i, "text/plain");
        FolderDraftSafety.planned(before, name);
        FolderDraftSafety.add(before, "last", "last", "text/plain");
        assertThrows(ApiException.class, () -> FolderDraftSafety.planned(before, name));
        assertThrows(ApiException.class, () -> FolderDraftSafety.add(before, "overflow", "overflow", "text/plain"));
    }
}
