// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
package io.github.quintond.orchestrator.phonecontrol;

import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;

/** Exact UTF-8 documents only: no normalization, replacement decoding, or truncation. */
final class DocumentText {
    static final int MAX_CHARS = 2000;
    static final int MAX_BYTES = 8192;
    private DocumentText() { }
    static boolean resourceId(String value) {
        return value != null && value.matches("[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}");
    }
    static boolean reviewName(String value) {
        return value != null && !value.isBlank() && value.length() <= 200
                && value.codePoints().noneMatch(point -> Character.isISOControl(point) || Character.getType(point) == Character.FORMAT);
    }
    static byte[] encode(String text) throws CharacterCodingException {
        if (text == null || text.length() > MAX_CHARS || text.indexOf('\0') >= 0) throw new CharacterCodingException();
        ByteBuffer encoded = StandardCharsets.UTF_8.newEncoder().onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT).encode(java.nio.CharBuffer.wrap(text));
        if (encoded.remaining() > MAX_BYTES) throw new CharacterCodingException();
        byte[] bytes = new byte[encoded.remaining()]; encoded.get(bytes); return bytes;
    }
    static String read(InputStream stream) throws IOException {
        byte[] bytes = stream.readNBytes(MAX_BYTES + 1);
        if (bytes.length > MAX_BYTES) throw new IOException("Document exceeds byte limit");
        String text = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();
        encode(text);
        return text;
    }
}
