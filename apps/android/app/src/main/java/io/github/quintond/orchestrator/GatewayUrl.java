package io.github.quintond.orchestrator;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

/** One explicit origin, never a URL containing credentials or a deep link. */
public final class GatewayUrl {
    private GatewayUrl() {}

    public static String normalize(String input) {
        try {
            URI uri = new URI(input.trim());
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
            String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
            boolean loopback = host.equals("127.0.0.1") || host.equals("localhost");
            if ((!scheme.equals("https") && !(scheme.equals("http") && loopback)) || host.isEmpty()
                    || uri.getRawUserInfo() != null || uri.getRawQuery() != null || uri.getRawFragment() != null
                    || (uri.getRawPath() != null && !uri.getRawPath().isEmpty() && !uri.getRawPath().equals("/"))
                    || uri.getPort() == 0 || uri.getPort() > 65535 || host.endsWith(".")) {
                throw new IllegalArgumentException();
            }
            int port = uri.getPort();
            if ((scheme.equals("https") && port == 443) || (scheme.equals("http") && port == 80)) port = -1;
            return new URI(scheme, null, host, port, null, null, null).toASCIIString();
        } catch (URISyntaxException | IllegalArgumentException exception) {
            throw new IllegalArgumentException("Use your gateway’s HTTPS address, or http://127.0.0.1:4400 with USB forwarding. Leave out paths, passwords and query strings.");
        }
    }

    public static boolean sameOrigin(String origin, String target) {
        try {
            URI uri = new URI(target);
            if (uri.getRawUserInfo() != null || uri.getHost() == null) return false;
            String candidate = new URI(uri.getScheme(), null, uri.getHost(), uri.getPort(), null, null, null).toASCIIString();
            return origin.equals(normalize(candidate));
        } catch (URISyntaxException | IllegalArgumentException exception) { return false; }
    }
}
