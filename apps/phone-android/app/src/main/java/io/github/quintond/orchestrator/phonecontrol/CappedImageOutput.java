// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
package io.github.quintond.orchestrator.phonecontrol;

import java.io.IOException;
import java.io.OutputStream;
import java.util.Arrays;
import java.util.Objects;

/** Fixed allocation: PNG encoders cannot grow their output beyond the configured cap. */
final class CappedImageOutput extends OutputStream {
    private final byte[] buffer;
    private int count;
    private boolean exceeded;
    CappedImageOutput(int capacity) {
        if (capacity < 1) throw new IllegalArgumentException("Positive image capacity required");
        buffer = new byte[capacity];
    }
    private void reserve(int length) throws IOException {
        if (exceeded || length > buffer.length - count) {
            exceeded = true;
            throw new IOException("Image output limit exceeded");
        }
    }
    @Override public void write(int value) throws IOException {
        reserve(1);
        buffer[count++] = (byte) value;
    }
    @Override public void write(byte[] bytes, int offset, int length) throws IOException {
        Objects.checkFromIndexSize(offset, length, bytes.length);
        reserve(length);
        System.arraycopy(bytes, offset, buffer, count, length);
        count += length;
    }
    boolean exceeded() { return exceeded; }
    byte[] bytes() throws IOException {
        if (exceeded) throw new IOException("Image output limit exceeded");
        return Arrays.copyOf(buffer, count);
    }
}
