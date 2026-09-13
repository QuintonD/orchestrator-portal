// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
package io.github.quintond.orchestrator.phonecontrol;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/** One request per connection. No chunking, browser origins, duplicate headers, or pipelining. */
final class HttpRequest {
    static final int MAX_BODY = 16_384;
    final String authorization;
    final String body;

    private HttpRequest(String authorization, String body) { this.authorization = authorization; this.body = body; }

    static HttpRequest read(InputStream in) throws IOException {
        ByteArrayOutputStream header = new ByteArrayOutputStream();
        int matched = 0;
        byte[] end = {13, 10, 13, 10};
        while (matched < 4) {
            int b = in.read();
            if (b < 0 || header.size() >= 8192 || b > 127 || (b < 32 && b != 13 && b != 10)) throw new IOException("Invalid HTTP headers");
            header.write(b);
            matched = b == end[matched] ? matched + 1 : (b == 13 ? 1 : 0);
        }
        String[] lines = header.toString(StandardCharsets.US_ASCII).split("\r\n");
        if (!lines[0].equals("POST /v1/call HTTP/1.1")) throw new IOException("Only POST /v1/call HTTP/1.1 is accepted");
        Map<String, String> headers = new HashMap<>();
        for (int i = 1; i < lines.length; i++) {
            int colon = lines[i].indexOf(':');
            if (colon <= 0) throw new IOException("Invalid HTTP header");
            String key = lines[i].substring(0, colon).toLowerCase(Locale.ROOT);
            String value = lines[i].substring(colon + 1).trim();
            if (!key.matches("[a-z0-9-]+") || headers.putIfAbsent(key, value) != null) throw new IOException("Duplicate or invalid HTTP header");
        }
        if (headers.containsKey("origin") || headers.containsKey("transfer-encoding") || headers.containsKey("expect")
                || headers.containsKey("upgrade") || headers.containsKey("sec-fetch-site")) throw new IOException("Browser and streaming requests are forbidden");
        String host = headers.getOrDefault("host", "");
        if (!host.matches("(127\\.0\\.0\\.1|localhost)(:[0-9]{1,5})?")) throw new IOException("Host must be loopback");
        if (!headers.getOrDefault("content-type", "").matches("application/json(;\\s*charset=utf-8)?")) throw new IOException("JSON content type required");
        String length = headers.getOrDefault("content-length", "");
        if (!length.matches("[0-9]{1,5}")) throw new IOException("Content length required");
        int count = Integer.parseInt(length);
        if (count < 2 || count > MAX_BODY) throw new IOException("Request too large or empty");
        byte[] bytes = in.readNBytes(count);
        if (bytes.length != count) throw new IOException("Truncated request");
        String body = new String(bytes, StandardCharsets.UTF_8);
        if (!java.util.Arrays.equals(bytes, body.getBytes(StandardCharsets.UTF_8))) throw new IOException("Invalid UTF-8");
        return new HttpRequest(headers.getOrDefault("authorization", ""), body);
    }
}
