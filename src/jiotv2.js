const M3U_URL = "https://go.streamstar18.workers.dev/";

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

  for (let line of lines) {
    line = line.trim();

    if (!line) {
      output.push("");
      continue;
    }

    // Remove unwanted DRM lines
    if (line.startsWith("#EXT-X-DRM-ID:")) continue;
    if (line.startsWith("#EXT-X-LICENSE-URL:")) continue;

    // Convert stream URL
    if (/^https?:\/\//i.test(line)) {
      const [url, params] = line.split("|");

      let cookie = "";

      if (params) {
        const match = params.match(/Cookie=([^&]+)/i);
        if (match) {
          cookie = decodeURIComponent(match[1]);
        }
      }

      output.push(cookie ? `${url}?${cookie}` : url);
      continue;
    }

    output.push(line);
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
