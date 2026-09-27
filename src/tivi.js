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
  const lines =
    m3u.split(/\r?\n/);

  for (
    let i = 0;
    i < lines.length;
    i++
  ) {
    const line =
      lines[i].trim();

    if (
      !line.startsWith("#EXTINF")
    ) {
      continue;
    }

    const match =
      line.match(
        /tvg-id="([^"]+)"/i
      );

    if (!match) {
      continue;
    }

    const tvgId = match[1];

    if (tvgId !== channelId) {
      continue;
    }

    // Find URL belonging to this channel
    for (
      let j = i + 1;
      j < lines.length;
      j++
    ) {
      const next =
        lines[j].trim();

      if (!next) {
        continue;
      }

      if (
        next.startsWith("#EXTINF")
      ) {
        break;
      }

      if (
        next.startsWith("#")
      ) {
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

export async function runTiviRedirect(
  request
) {
  const url =
    new URL(request.url);

  const channelId =
    url.pathname.substring(1);

  if (!channelId) {
    return new Response(
      "Missing channel ID",
      {
        status: 400,
      }
    );
  }

  try {
    const m3u =
      await getM3U();

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

    // Redirect directly to the real JioTV URL
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
// GENERATE PLAYLIST
// ============================================================

export async function runTiviPlaylist(
  request
) {
  try {
    const m3u =
      await getM3U();

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
      const line =
        lines[i];

      // Keep normal lines
      if (
        !line.trim().startsWith(
          "#EXTINF"
        )
      ) {
        output.push(line);
        continue;
      }

      const match =
        line.match(
          /tvg-id="([^"]+)"/i
        );

      // If no tvg-id, preserve entry
      if (!match) {
        output.push(line);
        continue;
      }

      const channelId =
        match[1];

      // Add EXTINF
      output.push(line);

      // Process channel metadata + URL
      for (
        let j = i + 1;
        j < lines.length;
        j++
      ) {
        const next =
          lines[j];

        const trimmed =
          next.trim();

        // Next channel
        if (
          trimmed.startsWith(
            "#EXTINF"
          )
        ) {
          break;
        }

        // Preserve blank lines
        if (!trimmed) {
          output.push(next);
          continue;
        }

        // Preserve KODIPROP
        if (
          trimmed.startsWith(
            "#KODIPROP:"
          )
        ) {
          output.push(next);
          continue;
        }

        // Preserve other M3U tags
        if (
          trimmed.startsWith("#")
        ) {
          output.push(next);
          continue;
        }

        // Replace original URL
        output.push(
          `${workerBase}/${encodeURIComponent(channelId)}`
        );

        // Skip original URL
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
