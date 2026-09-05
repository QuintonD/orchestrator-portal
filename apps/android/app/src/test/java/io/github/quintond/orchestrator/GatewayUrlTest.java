package io.github.quintond.orchestrator;

import org.junit.Test;
import static org.junit.Assert.*;

public class GatewayUrlTest {
    @Test public void canonicalizesExplicitOrigins() {
        assertEquals("https://my-box.example", GatewayUrl.normalize(" HTTPS://My-Box.example:443/ "));
        assertEquals("http://127.0.0.1:4400", GatewayUrl.normalize("http://127.0.0.1:4400/"));
        assertEquals("http://localhost:4400", GatewayUrl.normalize("http://localhost:4400"));
    }
    @Test public void rejectsAmbiguousAndInsecureAddresses() {
        String[] rejected = {"", "example.com", "http://192.168.1.2:4400", "http://10.0.2.2:4400",
            "javascript:alert(1)", "file:///etc/passwd", "https://user:secret@example.com", "https://example.com/path",
            "https://example.com?key=secret", "https://example.com#key", "http://localhost.evil.test", "http://127.1",
            "http://2130706433", "http://localhost.", "https://example.com:65536", "https://example.com:0",
            "https://example.com\\@evil.test", "https://%65xample.com"};
        for (String input : rejected) {
            assertThrows(input, IllegalArgumentException.class, () -> GatewayUrl.normalize(input));
        }
    }
    @Test public void navigationRequiresExactSchemeHostAndPort() {
        String origin = "https://gateway.example";
        assertTrue(GatewayUrl.sameOrigin(origin, "https://gateway.example:443/agents?draft=a"));
        for (String target : new String[]{"http://gateway.example", "https://gateway.example:444/", "https://gateway.example.evil.test", "https://gateway.example@evil.test", "https://user@gateway.example", "intent://gateway.example", "//gateway.example"}) {
            assertFalse(target, GatewayUrl.sameOrigin(origin, target));
        }
    }
}
