// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
package io.github.quintond.orchestrator.phonecontrol;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONException;
import org.json.JSONObject;

/** Never evicts within a session: a full ledger closes mutation capacity until local re-pairing. */
final class MutationLedger {
    private final SharedPreferences preferences;
    MutationLedger(Context context) { preferences = context.getSharedPreferences("phone-receipts", Context.MODE_PRIVATE); }
    synchronized void reset() throws ApiException {
        if (!preferences.edit().clear().commit()) throw new ApiException("storage_unavailable", "Could not rotate session receipts");
    }
    synchronized JSONObject previous(String id, String hash) throws ApiException {
        String receipt = preferences.getString(id, null);
        if (receipt == null) return null;
        try {
            JSONObject stored = new JSONObject(receipt);
            if (!hash.equals(stored.getString("hash"))) throw new ApiException("replay_conflict", "Request id already used for different parameters");
            return stored.getJSONObject("response");
        } catch (JSONException invalid) { throw new ApiException("storage_unavailable", "Receipt cannot be reconciled"); }
    }
    synchronized void begin(String id, String hash) throws ApiException {
        if (preferences.getAll().size() >= Policy.MAX_RECEIPTS) throw new ApiException("session_capacity", "Start a new phone session to authorize further actions");
        save(id, hash, Json.object("id", id, "error", Json.object("code", "unknown_action_state", "message", "An action with this id was reserved; do not replay it")));
    }
    synchronized void save(String id, String hash, JSONObject response) throws ApiException {
        if (!preferences.edit().putString(id, Json.object("hash", hash, "response", response).toString()).commit())
            throw new ApiException("storage_unavailable", "Action receipt could not be persisted; do not replay");
    }
}
