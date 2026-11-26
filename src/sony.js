/* --------------------------- CONFIG --------------------------- */
const M3U_URL = "https://premiumplugx.top/sony247655g/sony.php";

const GITHUB_PATH = "sony1080p.m3u";

/* ------------------------ HELPERS --------------------------- */
// Encode a UTF‑8 string to classic Base64 (works in Workers & Node).
function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// Remove any “[…]” block (including surrounding whitespace) from a name.
function stripQualityInfo(name) {
  return name.replace(/\s*\[[^\]]+\]/g, "").trim();
}

// Insert a space before the trailing digit(s) in sport‑channel titles:
//   "Sony Sports Ten5" → "Sony Sports Ten 5"
function normaliseSportName(name) {
  // Handles Ten, Pal, etc. – only adds a space when a digit follows a word without a space.
  return name.replace(/\b(Ten|Pal|AATH|YAY|MAX|MAX2|WAh|PIX|Sports|Sports Ten)(\d+)\b/gi, "$1 $2");
}

// Keep only the rows that belong to a 1080p channel.
// Returns an array of playlist lines (including the header).
function filter1080p(lines) {
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    // Preserve non‑#EXTINF lines (e.g. #EXTM3U, comments).
    if (!line.startsWith("#EXTINF")) {
      out.push(line);
      i++;
      continue;
    }

    // Next line should be the stream URL.
    const urlLine = i + 1 < lines.length ? lines[i + 1].trim() : "";

    // Extract the display title after the last comma.
    const [, info] = line.split(",", 2);
    const displayTitle = info ? info.trim() : "";

    // Keep only if the original title mentions 1080p.
    if (displayTitle.includes("1080p")) {
      const cleaned = stripQualityInfo(displayTitle);
      const normalised = normaliseSportName(cleaned);
      const cleanExtinf = `${line.split(",")[0]},${normalised}`;
      out.push(cleanExtinf);
      out.push(urlLine);
      out.push(""); // blank line for readability
    }

    i += 2; // skip the URL line we just processed
  }

  return out;
}

/* ---------------------- CORE LOGIC ------------------------ */
async function fetchM3U(url) {
  const resp = await fetch(`${url}?t=${Date.now()}`, {
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
  });

  if (!resp.ok) {
    throw new Error(`Failed to fetch M3U: ${resp.status} ${resp.statusText}`);
  }
  return await resp.text();
}

async function generateFilteredM3U() {
  const raw = await fetchM3U(M3U_URL);
  const now = new Date().toISOString();

  const lines = raw.split("\n");
  const filtered = filter1080p(lines);

  // Ensure a header exists.
  if (!filtered[0].startsWith("#EXTM3U")) filtered.unshift("#EXTM3U");

  // Insert helpful meta‑comments.
  filtered.splice(
    1,
    0,
    `# Source: ${M3U_URL}`,
    `# Filtered At: ${now}`,
    ""
  );

  return filtered.join("\n");
}

/* ---------------------- GITHUB UPLOAD --------------------- */
async function uploadToGitHub(content, env) {
  // Owner / repo are taken from environment variables (must be set as secrets).
  const owner = env.GITHUB_OWNER;
  const repo = env.GITHUB_REPO;

  if (!owner || !repo) {
    throw new Error("Missing GITHUB_OWNER or GITHUB_REPO in environment");
  }

  const api = `https://api.github.com/repos/${owner}/${repo}/contents/${GITHUB_PATH}`;

  // Get the old file SHA (if the file already exists) – required for updates.
  let sha;
  const oldResp = await fetch(api, {
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "User-Agent": "Cloudflare-Worker",
    },
  });

  if (oldResp.ok) {
    const oldJson = await oldResp.json();
    sha = oldJson.sha;
  }

  const body = {
    message: "Auto‑update filtered 1080p playlist",
    content: toBase64(content),
    sha,
  };

  const putResp = await fetch(api, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "Cloudflare-Worker",
    },
    body: JSON.stringify(body),
  });

  const result = await putResp.text();
  console.log("GitHub upload status:", putResp.status);
  console.log(result);
}

/* ---------------------- EXPORT ---------------------------- */
export async function runFilter1080p(env) {
  // 1️⃣ Generate the cleaned playlist.
  const m3u = await generateFilteredM3U();

  // 2️⃣ Upload to GitHub if a token is provided; otherwise just log.
  if (env?.GITHUB_TOKEN) {
    await uploadToGitHub(m3u, env);
  } else {
    console.log("Generated playlist (no upload):\n", m3u);
  }
}
