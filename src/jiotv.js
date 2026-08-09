const CHANNELS_URL = "https://raw.githubusercontent.com/qwerty180506/json/refs/heads/main/Geoplus.json";

// ---------------- BASE64 ----------------
function toBase64(str) {
  const bytes = new TextEncoder().encode(str);

  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary);
}

// ---------------- JSON FETCHER ----------------
async function getJson(url) {
  const freshUrl =
    `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;

  const response = await fetch(freshUrl, {
    headers: {
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
    },
    cf: {
      cacheTtl: 0,
      cacheEverything: false,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.json();
}

// ---------------- NORMAL COOKIE ----------------
async function getNormalCookie() {
  return "";
}

// ---------------- SPORTS DATA ----------------
async function getSportsData() {
  return {
    sportsIds: new Set(),
    sportsCookies: {},
  };
}

// ---------------- CHANNEL ENTRY ----------------
function createChannelEntry(channel, normalCookie = "") {
  const name = channel.name || "";
  const logo = channel.logo || "";
  const group = channel.group || channel.category || "Other";

  // Support BOTH formats:
  // "mpd" and "mpd_url"
  const url = channel.mpd || channel.mpd_url || "";

  // Support BOTH formats:
  // "cookie" and "headers.cookie"
  const cookie =
    channel.cookie ||
    channel.headers?.cookie ||
    normalCookie ||
    "";

  const lines = [];

  lines.push(
    `#EXTINF:-1 tvg-name="${name}" tvg-logo="${logo}" group-title="${group}",${name}`
  );

  // Detect DASH/MPD
  const isMPD =
    channel.type === "dash" ||
    /\.mpd(?:\?|$)/i.test(url);

  if (isMPD) {
    lines.push(
      "#KODIPROP:inputstream.adaptive.manifest_type=mpd"
    );

    // --------------------------------
    // Clearkey format 1:
    // keyId + key
    // --------------------------------
    if (channel.keyId && channel.key) {
      lines.push(
        "#KODIPROP:inputstream.adaptive.license_type=clearkey"
      );

      lines.push(
        `#KODIPROP:inputstream.adaptive.license_key=${channel.keyId}:${channel.key}`
      );
    }

    // --------------------------------
    // Clearkey format 2:
    // clearkey: { "keyId": "key" }
    // --------------------------------
    else if (
      channel.clearkey &&
      typeof channel.clearkey === "object" &&
      Object.keys(channel.clearkey).length
    ) {
      lines.push(
        "#KODIPROP:inputstream.adaptive.license_type=clearkey"
      );

      const [keyId, key] = Object.entries(channel.clearkey)[0];

      lines.push(
        `#KODIPROP:inputstream.adaptive.license_key=${keyId}:${key}`
      );
    }

    // --------------------------------
    // License URL format
    // --------------------------------
    else if (channel.license_url) {
      lines.push(
        "#KODIPROP:inputstream.adaptive.license_type=clearkey"
      );

      lines.push(
        `#KODIPROP:inputstream.adaptive.license_key=${channel.license_url}`
      );
    }
  }

  // --------------------------------
  // Add cookie to MPD URL
  // --------------------------------
  const finalUrl = cookie
    ? `${url}${url.includes("?") ? "&" : "?"}${cookie}`
    : url;

  lines.push(finalUrl);

  return lines.join("\n");
}


// ---------------- GENERATE M3U ----------------
async function generateM3U() {
  const channels = await getJson(CHANNELS_URL);
  const normalCookie = await getNormalCookie();
  const sportsData = await getSportsData();

  console.log(`Channels loaded: ${channels.length}`);

  const results = [];

  for (const channel of channels) {
    results.push(
      createChannelEntry(channel, normalCookie)
    );
  }

  console.log(`Channels generated: ${results.length}`);

  return ["#EXTM3U", "", ...results].join("\n\n");
}
// ---------------- GITHUB UPLOAD (ONLY IF CHANGED) ----------------
async function uploadToGitHub(content, env) {
  const path = "jiotv_cf.m3u";

  const api = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`;

  let sha;
  let existingContent = "";

  // 1. Fetch existing file
  const existing = await fetch(api, {
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "User-Agent": "Cloudflare-Worker",
    },
  });

  if (existing.ok) {
    const json = await existing.json();
    sha = json.sha;

    if (json.content) {
      existingContent = atob(json.content.replace(/\n/g, ""));
    }
  }

  // 2. Normalize and compare
  const normalize = (str) => str.trim().replace(/\r/g, "");

  if (sha && normalize(existingContent) === normalize(content)) {
    console.log("No changes detected. Skipping commit.");
    return;
  }

  // 3. Upload only if changed
  const upload = await fetch(api, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "Cloudflare-Worker",
    },
    body: JSON.stringify({
      message: `Auto update playlist ${new Date().toISOString()}`,
      content: toBase64(content),
      sha,
    }),
  });

  if (!upload.ok) {
    throw new Error(await upload.text());
  }

  console.log(`GitHub upload successful (${upload.status})`);
}

// ---------------- MAIN ----------------
export async function runJioTV(env) {
  const m3u = await generateM3U();

  await uploadToGitHub(m3u, env);

  console.log("Playlist updated successfully");

  return {
    success: true,
  };
}
