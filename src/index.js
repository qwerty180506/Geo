import { runJioTV } from "./jiotv.js";
import { runFancode } from "./fancode.js";

export default {
  // ---------------- MANUAL URL TRIGGER ----------------
  async fetch(request, env) {
    try {
      await runJioTV(env);
      await runFancode(env);

      return new Response(
        "Both playlists updated successfully"
      );
    } catch (e) {
      return new Response(
        "Error: " + e.toString(),
        {
          status: 500,
        }
      );
    }
  },
};
