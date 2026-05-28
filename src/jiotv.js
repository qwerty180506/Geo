const JSON_URL =
  "https://noisy-truth-6766.streamstar18.workers.dev/";

const HEADERS = {
  "User-Agent":
    "OTT Navigator/1.7.4.1 (Linux;Android 11)",
};

// ---------------- BASE64 SAFE ----------------
function toBase64(str) {
  const bytes = new TextEncoder().encode(str);

  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary);
}

// ---------------- PROCESS CHANNEL ----------------
async function processChannel(channel) {
  const name = channel.name || "Unknown";
  const chanId = channel.id || "";
  const logo = channel.logo || "";
  const group = channel.group || "Other";

  const mpd = (channel.mpd_url || "").replace(
    "|drmScheme=clearkey",
    ""
  );

  const licenseUrl = channel.license_url || "";
  const cookie = channel.headers?.cookie || "";

  const finalUrl = cookie ? `${mpd}?${cookie}` : mpd;

  const out = [
    `#EXTINF:-1 tvg-id="${chanId}" tvg-name="${name}" tvg-logo="${logo}" group-title="${group}",${name}`,
  ];

  // ---------------- CLEARKEY ----------------
  if (licenseUrl && licenseUrl !== "null") {
    out.push("#KODIPROP:inputstream.adaptive.license_type=clearkey");
    out.push(`#KODIPROP:inputstream.adaptive.license_key=${licenseUrl}`);
  }

  out.push(finalUrl);

  return out.join("\n");
}

// ---------------- GENERATE M3U ----------------
async function generateM3U() {
  // ✅ Fresh timestamp on EVERY request
  const now = new Date().toISOString();

  console.log("Generating playlist at:", now);

  const response = await fetch(
  `${JSON_URL}?t=${Date.now()}`,
  {
    headers: {
      ...HEADERS,
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
  }
);

  const channels = await response.json();

  let results = [];

  for (const channel of channels) {
    try {
      const line = await processChannel(channel);
      results.push(line);
    } catch (e) {
      console.log("Channel error:", e.toString());
    }
  }

  return [
    "#EXTM3U",
    "#Credits 🙏: cloudplay",
    "#Telegram: https://t.me/cloudply",
    `# Updated: ${now}`, // ✅ TIMESTAMP
    "",
    ...results,
  ].join("\n\n");
}
// ---------------- GITHUB UPLOAD ----------------
async function uploadToGitHub(content, env) {
  const path = "jiotv_cf.m3u";

  const api =
    `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`;

  let sha;

  // ---------------- GET OLD FILE ----------------
  const oldFile = await fetch(api, {
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "User-Agent": "Cloudflare-Worker",
    },
  });

  const oldText = await oldFile.text();

  try {
    const json = JSON.parse(oldText);
    sha = json.sha;
  } catch {}

  // ---------------- UPLOAD NEW FILE ----------------
  const upload = await fetch(api, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "Cloudflare-Worker",
    },
    body: JSON.stringify({
      message: "Auto update JioTV playlist",
      content: toBase64(content),
      sha,
    }),
  });

  const result = await upload.text();

  console.log("UPLOAD STATUS:", upload.status);
  console.log("UPLOAD RESPONSE:", result);
}

export async function runJioTV(env) {
  const m3u = await generateM3U();
  await uploadToGitHub(m3u, env);
}
