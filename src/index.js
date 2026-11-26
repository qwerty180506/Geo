import { runFancode } from "./fancode.js";
import { runMerge } from "./playlist.js";
import { runFilter1080p } from "./sony.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      await Promise.all([
        runFancode(env),          
        runFilter1080p(env),      
      ]);

      await runMerge(env);

      return new Response(
        "All playlists updated successfully!!!!",
        { status: 200 }
      );

    } catch (e) {
      return new Response(
        "Error: " + e.toString(),
        { status: 500 }
      );
    }
  },
};
