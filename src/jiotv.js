const CHANNELS_URL =
  "https://raw.githubusercontent.com/qwerty180506/json/refs/heads/main/channels.json";

const COOKIE_URL =
  "https://raw.githubusercontent.com/qwerty180506/json/refs/heads/main/biscuit.json";

const SPORTS_URL =
  "https://raw.githubusercontent.com/qwerty180506/json/refs/heads/main/sportsbiscuit.json";

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
  const data = await getJson(COOKIE_URL);

  const cookieObj = data.find((x) => x.cookie);

  return cookieObj?.cookie || "";
}

// ---------------- SPORTS DATA ----------------
async function getSportsData() {
  const data = await getJson(SPORTS_URL);

  const sportsIds = new Set();
  const sportsCookies = {};

  const allChannels = [
    ...(data.successful_results || []),
    ...(data.failed_results || []),
  ];

  for (const item of allChannels) {
    const channelId = String(item.channel_id);

    sportsIds.add(channelId);

    const finalUrl =
      item?.url ||
      item?.final_url ||
      item?.error_details?.final_url ||
      "";

    const match = finalUrl.match(/\?(.*)$/);

    if (match) {
      sportsCookies[channelId] = match[1];
    }
  }

  return {
    sportsIds,
    sportsCookies,
  };
}

// ---------------- CHANNEL ENTRY ----------------
function createChannelEntry(channel, cookie) {
  const id = channel.id || "";
  const name = channel.name || "";
  const logo = channel.logo || "";
  const group = channel.category || "Other";
  const url = channel.url || "";
  const keyId = channel.keyId || "";
  const key = channel.key || "";

  const lines = [];

  lines.push(
    `#EXTINF:-1 tvg-id="${id}" tvg-name="${name}" tvg-logo="${logo}" group-title="${group}",${name}`
  );

  // Add Kodi DASH/DRM properties only for MPD streams
  const isMPD = /\.mpd(\?|$)/i.test(url);

  if (isMPD) {
    lines.push("#KODIPROP:inputstream.adaptive.manifest_type=mpd");

    if (keyId && key) {
      lines.push("#KODIPROP:inputstream.adaptive.license_type=clearkey");
      lines.push(
        `#KODIPROP:inputstream.adaptive.license_key=${keyId}:${key}`
      );
    }
  }

  lines.push(`${url}?${cookie}`);

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
    const channelId = String(channel.id);

    const cookie = sportsData.sportsIds.has(channelId)
      ? sportsData.sportsCookies[channelId] || normalCookie
      : normalCookie;

    results.push(createChannelEntry(channel, cookie));
  }

  console.log(`Channels generated: ${results.length}`);

  // ❌ Removed Updated timestamp line
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
