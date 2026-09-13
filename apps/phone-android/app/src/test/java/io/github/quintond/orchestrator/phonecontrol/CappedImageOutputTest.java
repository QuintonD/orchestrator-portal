// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
package io.github.quintond.orchestrator.phonecontrol;

import static org.junit.Assert.*;
import java.io.IOException;
import org.junit.Test;

public class CappedImageOutputTest {
    @Test public void exactCapacityPreservesAllBytesAcrossEncoderChunks() throws Exception {
        CappedImageOutput out = new CappedImageOutput(5);
        out.write(1); out.write(new byte[]{8, 2, 3, 4, 8}, 1, 3); out.write(5);
        assertArrayEquals(new byte[]{1, 2, 3, 4, 5}, out.bytes()); assertFalse(out.exceeded());
    }
    @Test public void overflowDuringEncodingRejectsRatherThanReturningAPartialPng() throws Exception {
        CappedImageOutput out = new CappedImageOutput(8);
        out.write(new byte[7]);
        assertThrows(IOException.class, () -> out.write(new byte[2]));
        assertTrue(out.exceeded());
        assertThrows(IOException.class, out::bytes);
        assertThrows(IOException.class, () -> out.write(0));
    }
    @Test public void oneHugeWriteCannotGrowTheOutputStorage() {
        CappedImageOutput out = new CappedImageOutput(16);
        assertThrows(IOException.class, () -> out.write(new byte[100_000]));
        assertTrue(out.exceeded()); assertThrows(IOException.class, out::bytes);
    }
    @Test public void invalidOffsetsDoNotBecomeSuccessfulOutput() {
        CappedImageOutput out = new CappedImageOutput(16);
        assertThrows(IndexOutOfBoundsException.class, () -> out.write(new byte[4], 2, 4));
        assertThrows(IllegalArgumentException.class, () -> new CappedImageOutput(0));
    }
}
