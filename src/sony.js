const JSON_URL = "https://allinonereborn2.online/sony/sliv3.json";

const GITHUB_PATH = "sony1080p.m3u";

/* ------------------------ HELPERS --------------------------- */

// Escape values used in M3U attributes.
function escapeAttribute(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/\r?\n/g, " ")
    .trim();
}

// Normalise sport channel names.
function normaliseSportName(name) {
  return name.replace(
    /\b(TEN|PAL|AATH|YAY|MAX|MAX2|WAH|PIX)(\d+)\b/gi,
    "$1 $2"
  );
}

// Fetch and parse JSON.
async function fetchJSON(url) {
  const resp = await fetch(`${url}?t=${Date.now()}`, {
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
  });

  if (!resp.ok) {
    throw new Error(
      `Failed to fetch JSON: ${resp.status} ${resp.statusText}`
    );
  }

  return await resp.json();
}

/* ---------------------- JSON TO M3U ------------------------ */

// Convert JSON channel objects into M3U format.
function convertJSONtoM3U(data) {
  const output = ["#EXTM3U"];

  // Hardcoded custom headers
  const referer = "https://allinonereborn2.online/";
  const userAgent = "Mozilla/5.0 (Linux; Android 16; Pixel 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Mobile Safari/537.36";

  const kodiHeaders = `#KODIPROP:inputstream.adaptive.stream_headers=` +
    `Referer=${encodeURIComponent(referer)}&` +
    `User-Agent=${encodeURIComponent(userAgent)}`;

  for (const [key, channel] of Object.entries(data)) {
    if (!channel || !channel.m3u8) continue;

    const name = normaliseSportName(channel.title || key);
    const logo = channel.logo || "";
    const genre = channel.genre || "Uncategorized";
    const language = channel.language || "";
    const streamURL = channel.m3u8;

    // M3U metadata
    const extinf = `#EXTINF:-1 ` +
      `tvg-id="${escapeAttribute(channel.id || key)}" ` +
      `tvg-name="${escapeAttribute(name)}" ` +
      `tvg-logo="${escapeAttribute(logo)}" ` +
      `group-title="${escapeAttribute(genre)}" ` +
      `tvg-language="${escapeAttribute(language)}",` +
      `${name}`;

    output.push(extinf);
    output.push(kodiHeaders);
    output.push(streamURL);
    output.push("");
  }

  return output.join("\n");
}


/* ---------------------- CORE LOGIC ------------------------ */

async function generateFilteredM3U() {
  const data = await fetchJSON(JSON_URL);

  const channels = Object.values(data).filter(
    channel => channel && channel.m3u8
  );

  if (channels.length === 0) {
    throw new Error("No valid channels found in JSON");
  }

  const m3u = convertJSONtoM3U(data);

  const now = new Date().toISOString();

  return [
    "#EXTM3U",
    `# Source: ${JSON_URL}`,
    `# Generated At: ${now}`,
    "",
    ...m3u.split("\n").slice(1),
  ].join("\n");
}

/* ---------------------- GITHUB UPLOAD --------------------- */

async function uploadToGitHub(content, env) {
  const owner = env.GITHUB_OWNER;
  const repo = env.GITHUB_REPO;
  const token = env.GITHUB_TOKEN;

  if (!owner || !repo || !token) {
    throw new Error(
      "Missing GITHUB_OWNER, GITHUB_REPO or GITHUB_TOKEN"
    );
  }

  const api =
    `https://api.github.com/repos/${owner}/${repo}/contents/${GITHUB_PATH}`;

  // Get existing file SHA.
  let sha;

  const oldResp = await fetch(api, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "Cloudflare-Worker",
    },
  });

  if (oldResp.ok) {
    const oldJson = await oldResp.json();
    sha = oldJson.sha;
  } else if (oldResp.status !== 404) {
    throw new Error(
      `GitHub read failed: ${oldResp.status} ${await oldResp.text()}`
    );
  }

  // UTF-8 Base64 encoding.
  const bytes = new TextEncoder().encode(content);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  const body = {
    message: "Auto-update JSON to M3U playlist",
    content: btoa(binary),
    ...(sha ? { sha } : {}),
  };

  const putResp = await fetch(api, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "Cloudflare-Worker",
    },
    body: JSON.stringify(body),
  });

  const result = await putResp.text();

  console.log("GitHub upload status:", putResp.status);
  console.log(result);

  if (!putResp.ok) {
    throw new Error(`GitHub upload failed: ${result}`);
  }
}

/* ---------------------- EXPORT ---------------------------- */

// KEEPING ORIGINAL EXPORT FUNCTION NAME.
export async function runFilter1080p(env) {
  // 1. Fetch JSON and generate M3U.
  const m3u = await generateFilteredM3U();

  // 2. Upload to GitHub if token exists.
  if (env?.GITHUB_TOKEN) {
    await uploadToGitHub(m3u, env);
  } else {
    console.log("Generated playlist (no upload):\n", m3u);
  }

  return m3u;
}
