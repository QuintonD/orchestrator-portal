// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
package io.github.quintond.orchestrator.phonecontrol;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.junit.Test;
import static org.junit.Assert.*;

public final class DocumentTextTest {
    @Test public void preservesExactUnicodeAndLineEndings() throws Exception {
        for (String text : new String[]{"", "café 日本語 😀\r\nlast", "a".repeat(2000)})
            assertEquals(text, DocumentText.read(new ByteArrayInputStream(DocumentText.encode(text))));
    }
    @Test public void rejectsInvalidUtf8InsteadOfReplacingBytes() {
        assertThrows(IOException.class, () -> DocumentText.read(new ByteArrayInputStream(new byte[]{(byte) 0xc3, 0x28})));
        assertThrows(IOException.class, () -> DocumentText.read(new ByteArrayInputStream(new byte[]{(byte) 0xed, (byte) 0xa0, (byte) 0x80})));
    }
    @Test public void rejectsOversizeNulAndUnpairedSurrogates() {
        for (String text : new String[]{"a".repeat(2001), "a\0b", "\ud800", "\udfff"})
            assertThrows(IOException.class, () -> DocumentText.encode(text));
        assertThrows(IOException.class, () -> DocumentText.read(new ByteArrayInputStream(new byte[8193])));
    }
    @Test public void rejectsOversizeDecodedTextEvenWithinByteLimit() {
        assertThrows(IOException.class, () -> DocumentText.read(new ByteArrayInputStream("é".repeat(2001).getBytes(StandardCharsets.UTF_8))));
    }
    @Test public void onlyCanonicalOpaqueUuidV4HandlesResolve() {
        assertTrue(DocumentText.resourceId("550e8400-e29b-41d4-a716-446655440000"));
        for (String id : new String[]{"content://provider/document/1", "../target", "550E8400-E29B-41D4-A716-446655440000", "550e8400-e29b-11d4-a716-446655440000", "target", ""})
            assertFalse(DocumentText.resourceId(id));
    }
    @Test public void displayNamesCannotSpoofReviewWithControls() {
        assertTrue(DocumentText.reviewName("café notes.txt"));
        for (String name : new String[]{"a\nb", "a\tb", "a\u202eb", "a\u200fb", "a\0b", " ", "a".repeat(201)}) assertFalse(DocumentText.reviewName(name));
    }
}
