// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
package io.github.quintond.orchestrator.phonecontrol;

import static org.junit.Assert.*;
import org.junit.Test;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

public class HttpRequestTest {
    private String headers = "POST /v1/call HTTP/1.1\r\nHost: 127.0.0.1:8837\r\nContent-Type: application/json\r\nAuthorization: Bearer test\r\nContent-Length: 2\r\n";
    private HttpRequest parse(String value) throws IOException { return HttpRequest.read(new ByteArrayInputStream(value.getBytes(StandardCharsets.UTF_8))); }
    private void denied(String value) { try { parse(value); fail("Expected rejection"); } catch (IOException expected) { assertNotNull(expected.getMessage()); } }
    @Test public void acceptsOneBoundedLocalJsonRequest() throws Exception { HttpRequest request = parse(headers + "\r\n{}"); assertEquals("{}", request.body); assertEquals("Bearer test", request.authorization); }
    @Test public void rejectsBrowserOriginIncludingNull() { denied(headers + "Origin: null\r\n\r\n{}"); denied(headers + "Sec-Fetch-Site: same-origin\r\n\r\n{}"); }
    @Test public void rejectsDuplicateAuthorizationAndLengths() { denied(headers + "authorization: Bearer other\r\n\r\n{}"); denied(headers + "Content-Length: 2\r\n\r\n{}"); }
    @Test public void rejectsChunkedExpectAndUpgrade() { for (String extra : new String[]{"Transfer-Encoding: chunked", "Expect: 100-continue", "Upgrade: websocket"}) denied(headers + extra + "\r\n\r\n{}"); }
    @Test public void rejectsNonlocalHostsAndWrongPaths() { denied((headers + "\r\n{}").replace("127.0.0.1:8837", "evil.example")); denied((headers + "\r\n{}").replace("/v1/call", "/v1/call?extra=1")); }
    @Test public void rejectsWhitespaceHeaderNamesAndFoldedHeaders() { denied(headers + " Host: localhost\r\n\r\n{}"); denied(headers + "\tAuthorization: test\r\n\r\n{}"); }
    @Test public void rejectsOversizeAndTruncatedBody() { denied(headers.replace("Content-Length: 2", "Content-Length: 16385") + "\r\n{}"); denied(headers + "\r\n{"); }
    @Test public void rejectsUnboundedHeaderAndBodyWithoutLength() { denied(headers + "X-Large: " + "a".repeat(8192) + "\r\n\r\n{}"); denied(headers.replace("Content-Length: 2\r\n", "") + "\r\n{}"); }
}
