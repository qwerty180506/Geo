import { runJioTV } from "./jiotv.js";
import { runJioTV2 } from "./jiotv2.js";
import { runFancode } from "./fancode.js";
import {
  runHotstarPlaylist,
  getHotstarChannel
} from "./Hotstar.js";
import { runMerge } from "./playlist.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/playlist") {
      try {
        const m3u = await runHotstarPlaylist(request.url);

        return new Response(m3u, {
          status: 200,
          headers: {
            "Content-Type": "application/x-mpegURL; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-cache",
          },
        });
      } catch (e) {
        return new Response(
          "Hotstar playlist error: " + e.toString(),
          {
            status: 500,
            headers: {
              "Access-Control-Allow-Origin": "*",
            },
          }
        );
      }
    }

    if (url.pathname === "/stream") {
      const channel =
        url.searchParams.get("channel");

      if (!channel) {
        return new Response(
          "Missing channel parameter",
          {
            status: 400,
            headers: {
              "Access-Control-Allow-Origin": "*",
            },
          }
        );
      }

      try {
        const channelData =
          await getHotstarChannel(channel);

        if (!channelData) {
          return new Response(
            "Channel not found: " + channel,
            {
              status: 404,
              headers: {
                "Access-Control-Allow-Origin": "*",
              },
            }
          );
        }

        return new Response(
          JSON.stringify(channelData, null, 2),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          }
        );
      } catch (e) {
        return new Response(
          "Hotstar stream error: " + e.toString(),
          {
            status: 500,
            headers: {
              "Access-Control-Allow-Origin": "*",
            },
          }
        );
      }
    }

    if (url.pathname === "/proxy") {
      return new Response(
        "Hotstar proxy is not implemented yet.",
        {
          status: 501,
          headers: {
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    try {
      await Promise.all([
        runFancode(env),
        // runJioTV(env),
        runJioTV2(env),
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
