import { runJioTV } from "./jiotv.js";
import { runJioTV2 } from "./jiotv2.js";
import { runFancode } from "./fancode.js";
import { runTiviRedirect, runTiviPlaylist } from "./tivi.js";
import { runMerge } from "./playlist.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    if (url.pathname === "/playlist") {
      return await runTiviPlaylist(request);
    }

    if (
      url.pathname !== "/" &&
      /^\/[^/]+$/.test(url.pathname)
    ) {
      return await runTiviRedirect(request);
    }

    try {
      await Promise.all([
        runFancode(env),
        // runJioTV(env),
        runJioTV2(env),
      ]);

      await runMerge(env);

      return new Response(
        "All playlists updated successfully!!!"
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
//
