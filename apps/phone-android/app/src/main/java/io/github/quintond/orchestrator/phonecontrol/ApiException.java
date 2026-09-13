// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
package io.github.quintond.orchestrator.phonecontrol;

final class ApiException extends Exception {
    final String code;
    final org.json.JSONObject details;
    ApiException(String code, String message) { this(code, message, null); }
    ApiException(String code, String message, org.json.JSONObject details) { super(message); this.code = code; this.details = details; }
}
