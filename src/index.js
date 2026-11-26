import { runFancode } from "./fancode.js";
import { runMerge } from "./playlist.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      await Promise.all([
        runFancode(env),
      ]);

      await runMerge(env);

      return new Response(
        "All playlists updated successfully!!!!"
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
