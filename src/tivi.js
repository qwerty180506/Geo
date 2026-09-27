const M3U_URL ="https://raw.githubusercontent.com/qwerty180506/Geo/refs/heads/main/jiotv2.m3u";

// ============================================================
// FETCH SOURCE M3U
// ============================================================

async function getM3U() {
  const response = await fetch(M3U_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept": "*/*",
    },
  });

  if (!response.ok) {
    throw new Error(
      `M3U fetch failed: HTTP ${response.status}`
    );
  }

  return await response.text();
}

// ============================================================
// FIND CHANNEL BY TVG-ID
// ============================================================

function findChannel(m3u, channelId) {
  const lines = m3u.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line.startsWith("#EXTINF")) {
      continue;
    }

    const match = line.match(
      /tvg-id="([^"]+)"/i
    );

    if (!match) {
      continue;
    }

    if (match[1] !== channelId) {
      continue;
    }

    for (
      let j = i + 1;
      j < lines.length;
      j++
    ) {
      const next = lines[j].trim();

      if (!next) {
        continue;
      }

      if (next.startsWith("#EXTINF")) {
        break;
      }

      if (next.startsWith("#")) {
        continue;
      }

      if (
        next.startsWith("http://") ||
        next.startsWith("https://")
      ) {
        return {
          extinf: line,
          url: next,
        };
      }

      break;
    }

    return {
      extinf: line,
      url: null,
    };
  }

  return null;
}

// ============================================================
// CHANNEL REDIRECT
// ============================================================

export async function runJioTV2Redirect(request) {
  const url = new URL(request.url);

  const channelId =
    url.pathname.substring(1);

  if (!channelId) {
    return new Response(
      "Missing channel ID",
      { status: 400 }
    );
  }

  try {
    const m3u = await getM3U();

    const channel =
      findChannel(
        m3u,
        channelId
      );

    if (!channel) {
      return new Response(
        `Channel ID ${channelId} not found`,
        {
          status: 404,
        }
      );
    }

    if (!channel.url) {
      return new Response(
        `Stream URL not found for channel ${channelId}`,
        {
          status: 404,
        }
      );
    }

    return Response.redirect(
      channel.url,
      302
    );

  } catch (error) {
    return new Response(
      "Redirect error: " +
        error.toString(),
      {
        status: 500,
      }
    );
  }
}

// ============================================================
// PLAYLIST
// ============================================================

export async function runJioTV2Playlist(
  request
) {
  try {
    const m3u = await getM3U();

    const lines =
      m3u.split(/\r?\n/);

    const workerBase =
      new URL(request.url).origin;

    const output = [];

    for (
      let i = 0;
      i < lines.length;
      i++
    ) {
      const line = lines[i];

      if (
        !line.trim().startsWith("#EXTINF")
      ) {
        output.push(line);
        continue;
      }

      const match =
        line.match(
          /tvg-id="([^"]+)"/i
        );

      // No tvg-id → leave entry alone
      if (!match) {
        output.push(line);
        continue;
      }

      const channelId =
        match[1];

      // Add EXTINF
      output.push(line);

      // Copy everything until original URL
      for (
        let j = i + 1;
        j < lines.length;
        j++
      ) {
        const next = lines[j];

        if (
          next.trim().startsWith("#EXTINF")
        ) {
          break;
        }

        if (!next.trim()) {
          output.push(next);
          continue;
        }

        // Preserve KODIPROP
        if (
          next.trim().startsWith(
            "#KODIPROP:"
          )
        ) {
          output.push(next);
          continue;
        }

        // Preserve other tags
        if (
          next.trim().startsWith("#")
        ) {
          output.push(next);
          continue;
        }

        // Replace original URL
        output.push(
          `${workerBase}/${encodeURIComponent(
            channelId
          )}`
        );

        i = j;

        break;
      }
    }

    return new Response(
      output.join("\n"),
      {
        status: 200,
        headers: {
          "Content-Type":
            "application/x-mpegURL; charset=utf-8",

          "Access-Control-Allow-Origin":
            "*",

          "Cache-Control":
            "no-cache",
        },
      }
    );

  } catch (error) {
    return new Response(
      "Playlist error: " +
        error.toString(),
      {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin":
            "*",
        },
      }
    );
  }
}
