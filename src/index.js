import { runJioTV } from "./jiotv.js";
import { runJioTV2 } from "./jiotv2.js";
import { runFancode } from "./fancode.js";
import { runChannelFilter } from "./Hotstar.js";
import { runMerge } from "./playlist.js";

export default {
  async fetch(request, env) {
    try {
      await Promise.all([
        runFancode(env),
        //runJioTV(env),
        runJioTV2(env),
        //runChannelFilter(env)
      ]);

      await runMerge(env);

      return new Response(
        "All playlists updated successfully"
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
