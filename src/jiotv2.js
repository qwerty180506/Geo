const M3U_URL = "https://mute-sunset-8225.streamstar18.workers.dev";

// ---------------- BASE64 ----------------
function toBase64(str) {
  const bytes = new TextEncoder().encode(str);

  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary);
}

// ---------------- FETCH M3U ----------------
async function getM3U(url) {
  const response = await fetch(
    `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`,
    {
      headers: {
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
      cf: {
        cacheTtl: 0,
        cacheEverything: false,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch M3U: ${response.status}`);
  }

  return response.text();
}

// ---------------- PROCESS M3U ----------------
function processM3U(text) {
  const lines = text.replace(/\r/g, "").split("\n");
  const output = [];

  let extinf = null;
  let licenseType = null;
  let licenseKey = null;
  let cookie = "";

  for (let rawLine of lines) {
    const line = rawLine.trim();

    if (!line) continue;

    // Store metadata
    if (line.startsWith("#EXTINF")) {
      extinf = line;
      continue;
    }

    if (line.startsWith("#KODIPROP:inputstream.adaptive.license_type=")) {
      licenseType = line;
      continue;
    }

    if (line.startsWith("#KODIPROP:inputstream.adaptive.license_key=")) {
      licenseKey = line;
      continue;
    }

    // Ignore user-agent line
    if (line.startsWith("#EXTVLCOPT:")) {
      continue;
    }

    // Extract cookie from EXTHTTP
    if (line.startsWith("#EXTHTTP:")) {
      try {
        const json = JSON.parse(line.substring(9));
        cookie = json.cookie || "";
      } catch {
        cookie = "";
      }
      continue;
    }

    // Stream URL
    if (/^https?:\/\//i.test(line)) {
      let url = line.replace(/\?$/, "");

      if (cookie) {
        url += `?${cookie}`;
      }

      if (extinf) output.push(extinf);
      if (licenseType) output.push(licenseType);
      if (licenseKey) output.push(licenseKey);
      output.push(url);
      output.push("");

      // Reset for next channel
      extinf = null;
      licenseType = null;
      licenseKey = null;
      cookie = "";

      continue;
    }

    // Preserve other playlist tags if needed
    if (line.startsWith("#EXTM3U")) {
      output.push(line);
    }
  }

  return output.join("\n");
}
// ---------------- GITHUB UPLOAD ----------------
async function uploadToGitHub(content, env) {
  const path = "jiotv2.m3u";

  const api = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`;

  let sha;
  let existingContent = "";

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

  const normalize = (str) => str.trim().replace(/\r/g, "");

  if (sha && normalize(existingContent) === normalize(content)) {
    console.log("No changes detected. Skipping commit.");
    return;
  }

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
export async function runJioTV2(env) {
  const original = await getM3U(M3U_URL);

  const processed = processM3U(original);

  await uploadToGitHub(processed, env);

  console.log("Playlist updated successfully");

  return {
    success: true,
  };
}
