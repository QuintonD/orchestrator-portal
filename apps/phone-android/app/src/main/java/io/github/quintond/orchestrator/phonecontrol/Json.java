// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
package io.github.quintond.orchestrator.phonecontrol;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Iterator;
import java.util.Set;

final class Json {
    private Json() { }
    static JSONObject object(Object... pairs) {
        JSONObject value = new JSONObject();
        try { for (int i = 0; i < pairs.length; i += 2) value.put((String) pairs[i], pairs[i + 1]); }
        catch (JSONException impossible) { throw new IllegalArgumentException(impossible); }
        return value;
    }
    static void only(JSONObject value, String... allowed) throws ApiException {
        Set<String> keys = Set.of(allowed);
        for (Iterator<String> i = value.keys(); i.hasNext();) if (!keys.contains(i.next())) throw new ApiException("invalid_request", "Unexpected parameter");
    }
    static String string(JSONObject value, String key, int max) throws ApiException {
        Object raw = value.opt(key);
        if (!(raw instanceof String text) || text.isEmpty() || text.length() > max) throw new ApiException("invalid_request", "Missing or invalid " + key);
        return text;
    }
    static double number(JSONObject value, String key) throws ApiException {
        Object raw = value.opt(key);
        if (!(raw instanceof Number number) || !Double.isFinite(number.doubleValue())) throw new ApiException("invalid_request", "Invalid " + key);
        return number.doubleValue();
    }
    static String canonical(Object value) throws JSONException {
        if (value instanceof JSONObject object) {
            ArrayList<String> keys = new ArrayList<>();
            object.keys().forEachRemaining(keys::add);
            Collections.sort(keys);
            ArrayList<String> entries = new ArrayList<>();
            for (String key : keys) entries.add(JSONObject.quote(key) + ":" + canonical(object.get(key)));
            return "{" + String.join(",", entries) + "}";
        }
        if (value instanceof JSONArray array) {
            ArrayList<String> values = new ArrayList<>();
            for (int i = 0; i < array.length(); i++) values.add(canonical(array.get(i)));
            return "[" + String.join(",", values) + "]";
        }
        return value instanceof String text ? JSONObject.quote(text) : String.valueOf(value);
    }
}
