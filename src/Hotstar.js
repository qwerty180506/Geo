const SOURCE_M3U_URL = "https://premiumplugx.com/htt/hot.php?playlist=1";

const SOURCE_CACHE_SECONDS = 30;

// ============================================================
// FETCH SOURCE M3U
// ============================================================

async function getSourceM3U() {
  const response = await fetch(
    `${SOURCE_M3U_URL}?t=${Date.now()}`,
    {
      headers: {
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        "User-Agent": "Mozilla/5.0",
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      `Source M3U returned HTTP ${response.status}`
    );
  }

  return await response.text();
}

// ============================================================
// CREATE SLUG
// ============================================================

function createSlug(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// ============================================================
// GET CHANNEL NAME
// ============================================================

function extractChannelName(extinf) {
  const comma = extinf.indexOf(",");

  if (comma === -1) {
    return null;
  }

  return extinf
    .substring(comma + 1)
    .trim();
}

// ============================================================
// PARSE SOURCE URL
//
// Example:
//
// https://example.com/index.mpd?|cookie=xxx&referer=xxx
//
// Becomes:
//
// {
//   url,
//   cookie,
//   referer,
//   origin,
//   userAgent
// }
// ============================================================

function parseStreamURL(original) {
  const marker = "?|";

  const markerIndex = original.indexOf(marker);

  if (markerIndex === -1) {
    return {
      url: original,
      cookie: null,
      referer: null,
      origin: null,
      userAgent: null,
    };
  }

  const actualURL =
    original.substring(0, markerIndex);

  const headerString =
    original.substring(markerIndex + 2);

  const result = {
    url: actualURL,
    cookie: null,
    referer: null,
    origin: null,
    userAgent: null,
  };

  const cookieMatch =
    headerString.match(
      /(?:^|&)cookie=([\s\S]*?)(?=&(?:referer|origin|user-agent)=|$)/i
    );

  const refererMatch =
    headerString.match(
      /(?:^|&)referer=([\s\S]*?)(?=&(?:cookie|origin|user-agent)=|$)/i
    );

  const originMatch =
    headerString.match(
      /(?:^|&)origin=([\s\S]*?)(?=&(?:cookie|referer|user-agent)=|$)/i
    );

  const userAgentMatch =
    headerString.match(
      /(?:^|&)user-agent=([\s\S]*)$/i
    );

  if (cookieMatch) {
    result.cookie =
      decodeURIComponentSafe(cookieMatch[1]);
  }

  if (refererMatch) {
    result.referer =
      decodeURIComponentSafe(refererMatch[1]);
  }

  if (originMatch) {
    result.origin =
      decodeURIComponentSafe(originMatch[1]);
  }

  if (userAgentMatch) {
    result.userAgent =
      decodeURIComponentSafe(userAgentMatch[1]);
  }

  return result;
}

// ============================================================
// SAFE URL DECODE
// ============================================================

function decodeURIComponentSafe(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// ============================================================
// FIND CHANNEL
//
// Returns:
// - EXTINF
// - KODIPROP lines
// - original stream URL
// - parsed headers
// ============================================================

function findChannel(playlist, requestedSlug) {
  const lines = playlist.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line.startsWith("#EXTINF")) {
      continue;
    }

    const channelName =
      extractChannelName(line);

    if (!channelName) {
      continue;
    }

    const slug =
      createSlug(channelName);

    if (
      slug.toLowerCase() !==
      requestedSlug.toLowerCase()
    ) {
      continue;
    }

    const kodiprops = [];

    let streamURL = null;

    for (
      let j = i + 1;
      j < lines.length;
      j++
    ) {
      const next = lines[j].trim();

      if (!next) {
        continue;
      }

      // Stop if another channel starts
      if (next.startsWith("#EXTINF")) {
        break;
      }

      // Copy Kodi DRM properties
      if (
        next.startsWith("#KODIPROP:")
      ) {
        kodiprops.push(next);
        continue;
      }

      // Ignore other metadata
      if (next.startsWith("#")) {
        continue;
      }

      // First non-comment line = stream URL
      streamURL = next;
      break;
    }

    if (!streamURL) {
      return null;
    }

    return {
      channelName,
      slug,
      extinf: line,
      kodiprops,
      stream: parseStreamURL(streamURL),
    };
  }

  return null;
}

// ============================================================
// GENERATE CLEAN M3U
//
// Keeps:
//
// #EXTINF
// #KODIPROP
// Worker /stream URL
//
// Removes:
//
// Original Hotstar URL
// EXTHTTP
// EXTVLCOPT
// Other source metadata
// ============================================================

async function generateHotstarM3U(workerBaseURL) {
  const source = await getSourceM3U();

  const lines =
    source.split(/\r?\n/);

  const output = [
    "#EXTM3U",
    "",
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line.startsWith("#EXTINF")) {
      continue;
    }

    const channelName =
      extractChannelName(line);

    if (!channelName) {
      continue;
    }

    const slug =
      createSlug(channelName);

    if (!slug) {
      continue;
    }

    const kodiprops = [];

    let streamURL = null;
    let urlIndex = -1;

    // Read everything belonging to this channel
    for (
      let j = i + 1;
      j < lines.length;
      j++
    ) {
      const next = lines[j].trim();

      if (!next) {
        continue;
      }

      // Next channel
      if (next.startsWith("#EXTINF")) {
        break;
      }

      // Keep KODIPROP lines
      if (
        next.startsWith("#KODIPROP:")
      ) {
        kodiprops.push(next);
        continue;
      }

      // Ignore other #EXTVLCOPT / #EXTHTTP etc.
      if (next.startsWith("#")) {
        continue;
      }

      streamURL = next;
      urlIndex = j;
      break;
    }

    if (!streamURL) {
      continue;
    }

    // --------------------------------------------
    // EXTINF
    // --------------------------------------------

    output.push(line);

    // --------------------------------------------
    // COPY KODIPROP / CLEARKEY
    // --------------------------------------------

    for (const prop of kodiprops) {
      output.push(prop);
    }

    // --------------------------------------------
    // WORKER STREAM URL
    // --------------------------------------------

    const workerURL =
      new URL("/stream", workerBaseURL);

    workerURL.searchParams.set(
      "channel",
      slug
    );

    output.push(workerURL.href);

    output.push("");

    // Skip processed source lines
    if (urlIndex !== -1) {
      i = urlIndex;
    }
  }

  return output.join("\n");
}

// ============================================================
// STREAM LOOKUP
//
// Used by your existing /stream handler.
//
// Example:
//
// const channel = await getHotstarChannel(
//   "star-sports-1-hd"
// );
//
// ============================================================

export async function getHotstarChannel(
  channel
) {
  const source =
    await getSourceM3U();

  return findChannel(
    source,
    channel
  );
}

// ============================================================
// GENERATE PLAYLIST
//
// Call this from your existing Worker:
//
// const m3u = await runHotstarPlaylist(
//   request.url
// );
//
// return new Response(m3u, {
//   headers: {
//     "Content-Type":
//       "application/x-mpegURL",
//   },
// });
// ============================================================

export async function runHotstarPlaylist(
  workerBaseURL
) {
  return await generateHotstarM3U(
    workerBaseURL
  );
}
