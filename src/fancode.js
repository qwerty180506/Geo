const JSON_URL =
  "https://raw.githubusercontent.com/drmlive/fancode-live-events/refs/heads/main/fancode.json";

// ---------------- BASE64 SAFE ----------------
function toBase64(str) {
  const bytes = new TextEncoder().encode(str);

  let binary = "";

  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary);
}

// ---------------- GENERATE FANCODE M3U ----------------
async function generateFancodeM3U() {
  // ✅ Fresh timestamp every request
  const now = new Date().toISOString();

  console.log("Generating Fancode playlist at:", now);

 const response = await fetch(
  `${JSON_URL}?t=${Date.now()}`,
  {
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
  }
);
  
  const data = await response.json();

  let output = [
    "#EXTM3U",
    `# Source Updated: ${data["last update time"] || "N/A"}`,
    `# Generated At: ${now}`, // ✅ FORCE FILE CHANGE
    "",
  ];

  for (const match of data.matches || []) {
    try {
      if ((match.status || "").toUpperCase() !== "LIVE") {
        continue;
      }

      const stream =
        match.adfree_url || match.dai_url;

      if (!stream) continue;

      const title =
        match.title ||
        match.match_name ||
        "Unknown";

      const category =
        match.event_category || "Sports";

      const logo = match.src || "";

      output.push(
        `#EXTINF:-1 tvg-logo="${logo}" group-title="Fancode",${category} | ${title}`
      );

      output.push(stream);
      output.push("");
    } catch (e) {
      console.log("Fancode error:", e.toString());
    }
  }

  return output.join("\n");
}

// ---------------- GITHUB UPLOAD ----------------
async function uploadToGitHub(content, env) {
  const path = "fancode_1080p.m3u";

  const api =
    `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`;

  let sha;

  // GET OLD FILE
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

  // UPLOAD NEW FILE
  const upload = await fetch(api, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "Cloudflare-Worker",
    },
    body: JSON.stringify({
      message: "Auto update Fancode playlist",
      content: toBase64(content),
      sha,
    }),
  });

  const result = await upload.text();

  console.log("Fancode Upload:", upload.status);
  console.log(result);
}

// ---------------- EXPORTED FUNCTION ----------------
export async function runFancode(env) {
  const m3u = await generateFancodeM3U();
  await uploadToGitHub(m3u, env);
}
