const SOURCE_M3U_URL =
  "https://premiumplugx.com/htt/hot.php?playlist=1";

const SOURCE_CACHE_SECONDS = 30;

// ============================================================
// FETCH SOURCE M3U
// ============================================================

async function getSourceM3U() {
  const response = await fetch(
    `${SOURCE_M3U_URL}&t=${Date.now()}`,
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
// PARSE STREAM URL
//
// Example:
//
// https://example.com/index.mpd?|cookie=xxx&referer=xxx
//
// ============================================================

function parseStreamURL(original) {
  const marker = "?|";

  const markerIndex =
    original.indexOf(marker);

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
      decodeURIComponentSafe(
        cookieMatch[1]
      );
  }

  if (refererMatch) {
    result.referer =
      decodeURIComponentSafe(
        refererMatch[1]
      );
  }

  if (originMatch) {
    result.origin =
      decodeURIComponentSafe(
        originMatch[1]
      );
  }

  if (userAgentMatch) {
    result.userAgent =
      decodeURIComponentSafe(
        userAgentMatch[1]
      );
  }

  return result;
}

// ============================================================
// FIND CHANNEL
// ============================================================

function findChannel(
  playlist,
  requestedSlug
) {
  const lines =
    playlist.split(/\r?\n/);

  for (
    let i = 0;
    i < lines.length;
    i++
  ) {
    const line =
      lines[i].trim();

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
        next.startsWith("#KODIPROP:")
      ) {
        kodiprops.push(next);
        continue;
      }

      if (next.startsWith("#")) {
        continue;
      }

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
// GET CHANNEL
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
// ============================================================

async function generateHotstarM3U(
  workerBaseURL
) {
  const source =
    await getSourceM3U();

  const lines =
    source.split(/\r?\n/);

  const output = [
    "#EXTM3U",
    "",
  ];

  for (
    let i = 0;
    i < lines.length;
    i++
  ) {
    const line =
      lines[i].trim();

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
        next.startsWith("#KODIPROP:")
      ) {
        kodiprops.push(next);
        continue;
      }

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

    // EXTINF
    output.push(line);

    // Preserve ClearKey / Kodi properties
    for (const prop of kodiprops) {
      output.push(prop);
    }

    // Worker /stream URL
    const workerURL =
      new URL(
        "/stream",
        workerBaseURL
      );

    workerURL.searchParams.set(
      "channel",
      slug
    );

    output.push(
      workerURL.href
    );

    output.push("");

    if (urlIndex !== -1) {
      i = urlIndex;
    }
  }

  return output.join("\n");
}

// ============================================================
// PUBLIC PLAYLIST FUNCTION
// ============================================================

export async function runHotstarPlaylist(
  workerBaseURL
) {
  return await generateHotstarM3U(
    workerBaseURL
  );
}

// ============================================================
// CREATE UPSTREAM HEADERS
// ============================================================

function createUpstreamHeaders(
  stream
) {
  const headers =
    new Headers();

  if (stream.cookie) {
    headers.set(
      "Cookie",
      stream.cookie
    );
  }

  if (stream.referer) {
    headers.set(
      "Referer",
      stream.referer
    );
  }

  if (stream.origin) {
    headers.set(
      "Origin",
      stream.origin
    );
  }

  if (stream.userAgent) {
    headers.set(
      "User-Agent",
      stream.userAgent
    );
  }

  return headers;
}

// ============================================================
// HTTP URL CHECK
// ============================================================

function isHTTPURL(value) {
  try {
    const url =
      new URL(value);

    return (
      url.protocol === "http:" ||
      url.protocol === "https:"
    );
  } catch {
    return false;
  }
}

// ============================================================
// RESOLVE URL
// ============================================================

function resolveURL(
  value,
  baseURL
) {
  try {
    const resolved =
      new URL(
        value,
        baseURL
      );

    if (
      resolved.protocol !== "http:" &&
      resolved.protocol !== "https:"
    ) {
      return value;
    }

    return resolved.href;
  } catch {
    return value;
  }
}

// ============================================================
// CREATE PROXY URL
// ============================================================

function createProxyURL(
  workerBaseURL,
  channel,
  targetURL
) {
  const proxy =
    new URL(
      "/proxy",
      workerBaseURL
    );

  proxy.searchParams.set(
    "channel",
    channel
  );

  proxy.searchParams.set(
    "url",
    targetURL
  );

  return proxy.href;
}

// ============================================================
// REWRITE HLS M3U8
// ============================================================

function rewriteM3U8(
  manifest,
  manifestURL,
  workerBaseURL,
  channel
) {
  const lines =
    manifest.split(/\r?\n/);

  const output = [];

  for (const line of lines) {
    const trimmed =
      line.trim();

    // ----------------------------------------------------------
    // URI="..." attributes
    //
    // Used by EXT-X-KEY, EXT-X-MAP, EXT-X-MEDIA, etc.
    // ----------------------------------------------------------

    if (
      trimmed.startsWith("#")
    ) {
      const rewritten =
        line.replace(
          /URI="([^"]+)"/gi,
          (match, uri) => {
            const absolute =
              resolveURL(
                uri,
                manifestURL
              );

            if (
              !isHTTPURL(
                absolute
              )
            ) {
              return match;
            }

            return `URI="${createProxyURL(
              workerBaseURL,
              channel,
              absolute
            )}"`;
          }
        );

      output.push(
        rewritten
      );

      continue;
    }

    // ----------------------------------------------------------
    // Empty line
    // ----------------------------------------------------------

    if (!trimmed) {
      output.push(line);
      continue;
    }

    // ----------------------------------------------------------
    // Normal HLS URL
    // ----------------------------------------------------------

    const absolute =
      resolveURL(
        trimmed,
        manifestURL
      );

    if (
      isHTTPURL(absolute)
    ) {
      output.push(
        createProxyURL(
          workerBaseURL,
          channel,
          absolute
        )
      );
    } else {
      output.push(line);
    }
  }

  return output.join("\n");
}

// ============================================================
// REWRITE DASH MPD
// ============================================================

function rewriteMPD(
  manifest,
  manifestURL,
  workerBaseURL,
  channel
) {
  // ----------------------------------------------------------
  // Rewrite <BaseURL>
  // ----------------------------------------------------------

  let output =
    manifest.replace(
      /(<BaseURL[^>]*>)([\s\S]*?)(<\/BaseURL>)/gi,
      (match, open, value, close) => {
        const trimmed =
          value.trim();

        if (!trimmed) {
          return match;
        }

        const absolute =
          resolveURL(
            trimmed,
            manifestURL
          );

        if (
          !isHTTPURL(absolute)
        ) {
          return match;
        }

        const proxy =
          createProxyURL(
            workerBaseURL,
            channel,
            absolute
          );

        return (
          open +
          proxy +
          close
        );
      }
    );

  // ----------------------------------------------------------
  // Rewrite media=""
  // ----------------------------------------------------------

  output =
    output.replace(
      /(\bmedia\s*=\s*["'])([^"']+)(["'])/gi,
      (match, open, value, close) => {
        const absolute =
          resolveURL(
            value,
            manifestURL
          );

        if (
          !isHTTPURL(absolute)
        ) {
          return match;
        }

        return (
          open +
          createProxyURL(
            workerBaseURL,
            channel,
            absolute
          ) +
          close
        );
      }
    );

  // ----------------------------------------------------------
  // Rewrite initialization=""
  // ----------------------------------------------------------

  output =
    output.replace(
      /(\binitialization\s*=\s*["'])([^"']+)(["'])/gi,
      (match, open, value, close) => {
        const absolute =
          resolveURL(
            value,
            manifestURL
          );

        if (
          !isHTTPURL(absolute)
        ) {
          return match;
        }

        return (
          open +
          createProxyURL(
            workerBaseURL,
            channel,
            absolute
          ) +
          close
        );
      }
    );

  // ----------------------------------------------------------
  // Rewrite sourceURL=""
  // ----------------------------------------------------------

  output =
    output.replace(
      /(\bsourceURL\s*=\s*["'])([^"']+)(["'])/gi,
      (match, open, value, close) => {
        const absolute =
          resolveURL(
            value,
            manifestURL
          );

        if (
          !isHTTPURL(absolute)
        ) {
          return match;
        }

        return (
          open +
          createProxyURL(
            workerBaseURL,
            channel,
            absolute
          ) +
          close
        );
      }
    );

  return output;
}

// ============================================================
// DETECT MANIFEST TYPE
// ============================================================

function detectManifestType(
  url,
  contentType,
  body
) {
  const lowerURL =
    url.toLowerCase();

  const lowerType =
    (contentType || "").toLowerCase();

  const lowerBody =
    body.trim().toLowerCase();

  if (
    lowerURL.includes(".m3u8") ||
    lowerType.includes("mpegurl") ||
    lowerBody.startsWith("#extm3u")
  ) {
    return "hls";
  }

  if (
    lowerURL.includes(".mpd") ||
    lowerType.includes("dash") ||
    lowerBody.includes("<mpd")
  ) {
    return "dash";
  }

  return null;
}

// ============================================================
// /stream
//
// Fetches original Hotstar manifest and rewrites all
// child URLs through /proxy.
// ============================================================

export async function runHotstarStream(
  request,
  channel
) {
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

  const channelData =
    await getHotstarChannel(
      channel
    );

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

  const stream =
    channelData.stream;

  if (!stream || !stream.url) {
    return new Response(
      "Stream URL not found",
      {
        status: 404,
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }

  const headers =
    createUpstreamHeaders(
      stream
    );

  const upstream =
    await fetch(
      stream.url,
      {
        method: "GET",
        headers,
      }
    );

  if (!upstream.ok) {
  return new Response(
    JSON.stringify({
      status: upstream.status,
      streamURL: stream.url,
      cookie: !!stream.cookie,
      referer: stream.referer,
      origin: stream.origin,
      userAgent: stream.userAgent,
    }, null, 2),
    {
      status: 502,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
    }
  );
}

  const contentType =
    upstream.headers.get(
      "content-type"
    ) || "";

  const body =
    await upstream.text();

  const manifestType =
    detectManifestType(
      stream.url,
      contentType,
      body
    );

  // ----------------------------------------------------------
  // Not a manifest
  // ----------------------------------------------------------

  if (!manifestType) {
    return new Response(
      body,
      {
        status: upstream.status,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type":
            contentType ||
            "text/plain",
        },
      }
    );
  }

  // ----------------------------------------------------------
  // Worker base URL
  // ----------------------------------------------------------

  const requestURL =
    new URL(
      request.url
    );

  const workerBaseURL =
    `${requestURL.protocol}//${requestURL.host}`;

  // ----------------------------------------------------------
  // Rewrite manifest
  // ----------------------------------------------------------

  let rewritten;

  if (
    manifestType === "hls"
  ) {
    rewritten =
      rewriteM3U8(
        body,
        stream.url,
        workerBaseURL,
        channel
      );
  } else {
    rewritten =
      rewriteMPD(
        body,
        stream.url,
        workerBaseURL,
        channel
      );
  }

  return new Response(
    rewritten,
    {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Content-Type":
          manifestType === "hls"
            ? "application/vnd.apple.mpegurl"
            : "application/dash+xml",
        "Cache-Control":
          "no-cache",
      },
    }
  );
}

// ============================================================
// /proxy
//
// Fetches MPD/HLS child URLs using the SAME channel's
// original cookie/referer/origin/user-agent.
// ============================================================

export async function runHotstarProxy(
  request,
  channel,
  targetURL
) {
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

  if (!targetURL) {
    return new Response(
      "Missing url parameter",
      {
        status: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }

  if (
    !isHTTPURL(targetURL)
  ) {
    return new Response(
      "Invalid target URL",
      {
        status: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }

  const channelData =
    await getHotstarChannel(
      channel
    );

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

  const stream =
    channelData.stream;

  const headers =
    createUpstreamHeaders(
      stream
    );

  const upstream =
    await fetch(
      targetURL,
      {
        method:
          request.method === "HEAD"
            ? "HEAD"
            : "GET",
        headers,
      }
    );

  const responseHeaders =
    new Headers();

  responseHeaders.set(
    "Access-Control-Allow-Origin",
    "*"
  );

  responseHeaders.set(
    "Access-Control-Allow-Headers",
    "*"
  );

  const contentType =
    upstream.headers.get(
      "content-type"
    );

  if (contentType) {
    responseHeaders.set(
      "Content-Type",
      contentType
    );
  }

  const contentLength =
    upstream.headers.get(
      "content-length"
    );

  if (contentLength) {
    responseHeaders.set(
      "Content-Length",
      contentLength
    );
  }

  return new Response(
    upstream.body,
    {
      status: upstream.status,
      headers: responseHeaders,
    }
  );
}

// ============================================================
// MAIN HOTSTAR ROUTER
//
// Optional convenience function.
//
// index.js can simply call:
//
// runHotstar(request)
//
// ============================================================

export async function runHotstar(
  request
) {
  const url =
    new URL(request.url);

  // ----------------------------------------------------------
  // /playlist
  // ----------------------------------------------------------

  if (
    url.pathname === "/playlist"
  ) {
    try {
      const m3u =
        await runHotstarPlaylist(
          request.url
        );

      return new Response(
        m3u,
        {
          status: 200,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Content-Type":
              "application/x-mpegURL; charset=utf-8",
            "Cache-Control":
              "no-cache",
          },
        }
      );
    } catch (error) {
      return new Response(
        "Hotstar playlist error: " +
          error.toString(),
        {
          status: 500,
          headers: {
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }
  }

  // ----------------------------------------------------------
  // /stream
  // ----------------------------------------------------------

  if (
    url.pathname === "/stream"
  ) {
    const channel =
      url.searchParams.get(
        "channel"
      );

    try {
      return await runHotstarStream(
        request,
        channel
      );
    } catch (error) {
      return new Response(
        "Hotstar stream error: " +
          error.toString(),
        {
          status: 500,
          headers: {
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }
  }

  // ----------------------------------------------------------
  // /proxy
  // ----------------------------------------------------------

  if (
    url.pathname === "/proxy"
  ) {
    const channel =
      url.searchParams.get(
        "channel"
      );

    const targetURL =
      url.searchParams.get(
        "url"
      );

    try {
      return await runHotstarProxy(
        request,
        channel,
        targetURL
      );
    } catch (error) {
      return new Response(
        "Hotstar proxy error: " +
          error.toString(),
        {
          status: 500,
          headers: {
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }
  }

  return new Response(
    "Hotstar Worker is running.",
    {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "text/plain",
      },
    }
  );
}
