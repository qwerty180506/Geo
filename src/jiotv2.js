const M3U_URL = "https://premiumplugx.top/jiostb/mjelo.php?view=raw";

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
  console.log("Fetching M3U:", url);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Accept": "*/*",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache"
    },
    cf: {
      cacheTtl: 0,
      cacheEverything: false
    }
  });

  console.log("M3U status:", response.status);

  const body = await response.text();

  if (!response.ok) {
    console.error("M3U response:", body);

    throw new Error(
      `Failed to fetch M3U: ${response.status} ${response.statusText}`
    );
  }

  return body;
}

// ---------------- CLEAN TVG LOGO ----------------
function cleanExtinf(line) {
  // Convert:
  // tvg-logo="[https://example.com/logo.jpg](https://example.com/logo.jpg)"
  //
  // Into:
  // tvg-logo="https://example.com/logo.jpg"

  line = line.replace(
    /tvg-logo="?\[([^\]]+)\]\(([^)]+)\)"?/i,
    (match, markdownUrl, actualUrl) => {
      return `tvg-logo="${actualUrl}"`;
    }
  );

  // Also handle normal Markdown-style URL if the above didn't match
  line = line.replace(
    /tvg-logo="\[([^\]]+)\]\(([^)]+)\)"/i,
    'tvg-logo="$2"'
  );

  return line;
}

// ---------------- CLEAN STREAM URL ----------------
function cleanStreamUrl(line) {
  let url = line.trim();

  // ------------------------------------------------
  // Remove everything after pipe
  //
  // Example:
  // https://example.com/index.mpd?cookie=abc|Cookie=abc&xxx=...
  //
  // Becomes:
  // https://example.com/index.mpd?cookie=abc
  // ------------------------------------------------
  if (url.includes("|")) {
    url = url.split("|")[0];
  }

  // Remove accidental trailing ?
  url = url.replace(/\?$/, "");

  return url;
}

// ---------------- PROCESS M3U ----------------
function processM3U(text) {
  const lines = text
    .replace(/\r/g, "")
    .split("\n");

  const output = [];

  let extinf = null;
  let inputstream = null;
  let manifestType = null;
  let licenseType = null;
  let licenseKey = null;
  let userAgent = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    // ------------------------------------------------
    // Playlist header
    // ------------------------------------------------
    if (line.startsWith("#EXTM3U")) {
      output.push(line);
      continue;
    }

    // ------------------------------------------------
    // EXTINF
    // ------------------------------------------------
    if (line.startsWith("#EXTINF")) {
      extinf = cleanExtinf(line);
      continue;
    }

    // ------------------------------------------------
    // Inputstream
    // ------------------------------------------------
    if (
      line.startsWith(
        "#KODIPROP:inputstream=inputstream.adaptive"
      )
    ) {
      inputstream = line;
      continue;
    }

    // ------------------------------------------------
    // Manifest type
    // ------------------------------------------------
    if (
      line.startsWith(
        "#KODIPROP:inputstream.adaptive.manifest_type="
      )
    ) {
      manifestType = line;
      continue;
    }

    // ------------------------------------------------
    // License type
    // ------------------------------------------------
    if (
      line.startsWith(
        "#KODIPROP:inputstream.adaptive.license_type="
      )
    ) {
      licenseType = line;
      continue;
    }

    // ------------------------------------------------
    // License key
    // ------------------------------------------------
    if (
      line.startsWith(
        "#KODIPROP:inputstream.adaptive.license_key="
      )
    ) {
      licenseKey = line;
      continue;
    }

    // ------------------------------------------------
    // User agent
    // ------------------------------------------------
    if (
      line.startsWith(
        "#EXTVLCOPT:http-user-agent="
      )
    ) {
      userAgent = line;
      continue;
    }

    // ------------------------------------------------
    // Remove stream_headers completely
    // ------------------------------------------------
    if (
      line.startsWith(
        "#KODIPROP:inputstream.adaptive.stream_headers="
      )
    ) {
      continue;
    }

    // ------------------------------------------------
    // Remove EXTHTTP completely
    // ------------------------------------------------
    if (line.startsWith("#EXTHTTP:")) {
      continue;
    }

    // ------------------------------------------------
    // Stream URL
    // ------------------------------------------------
    if (/^https?:\/\//i.test(line)) {
      const streamUrl = cleanStreamUrl(line);

      // EXTINF
      if (extinf) {
        output.push(extinf);
      }

      // Inputstream
      if (inputstream) {
        output.push(inputstream);
      }

      // Manifest type
      if (manifestType) {
        output.push(manifestType);
      }

      // License type
      if (licenseType) {
        output.push(licenseType);
      }

      // License key
      if (licenseKey) {
        output.push(licenseKey);
      }

      // User agent
      if (userAgent) {
        output.push(userAgent);
      }

      // Final clean stream URL
      output.push(streamUrl);

      output.push("");

      // Reset channel data
      extinf = null;
      inputstream = null;
      manifestType = null;
      licenseType = null;
      licenseKey = null;
      userAgent = null;

      continue;
    }

    // ------------------------------------------------
    // Ignore unknown comments/tags
    // ------------------------------------------------
  }

  return output.join("\n").trim() + "\n";
}

// ---------------- GITHUB UPLOAD ----------------
async function uploadToGitHub(content, env) {
  const path = "jiotv2.m3u";

  const api =
    `https://api.github.com/repos/` +
    `${env.GITHUB_OWNER}/` +
    `${env.GITHUB_REPO}/contents/${path}`;

  let sha;
  let existingContent = "";

  // ------------------------------------------------
  // Check existing file
  // ------------------------------------------------
  const existing = await fetch(api, {
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "User-Agent": "Cloudflare-Worker"
    }
  });

  if (existing.ok) {
    const json = await existing.json();

    sha = json.sha;

    if (json.content) {
      existingContent = atob(
        json.content.replace(/\n/g, "")
      );
    }
  }

  // ------------------------------------------------
  // Compare existing and new content
  // ------------------------------------------------
  const normalize = (str) =>
    str
      .trim()
      .replace(/\r/g, "");

  if (
    sha &&
    normalize(existingContent) === normalize(content)
  ) {
    console.log(
      "No changes detected. Skipping commit."
    );

    return;
  }

  // ------------------------------------------------
  // Upload
  // ------------------------------------------------
  const upload = await fetch(api, {
    method: "PUT",

    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "Cloudflare-Worker"
    },

    body: JSON.stringify({
      message:
        `Auto update playlist ${new Date().toISOString()}`,

      content: toBase64(content),

      ...(sha ? { sha } : {})
    })
  });

  if (!upload.ok) {
    const errorText = await upload.text();

    throw new Error(
      `GitHub upload failed: ${upload.status} ${errorText}`
    );
  }

  console.log(
    `GitHub upload successful (${upload.status})`
  );
}

// ---------------- MAIN ----------------
export async function runJioTV2(env) {
  console.log("Starting JioTV2 playlist update...");

  // Fetch original playlist
  const original = await getM3U(M3U_URL);

  console.log(
    `Original playlist size: ${original.length} bytes`
  );

  // Process playlist
  const processed = processM3U(original);

  console.log(
    `Processed playlist size: ${processed.length} bytes`
  );

  // Upload to GitHub
  await uploadToGitHub(processed, env);

  console.log(
    "Playlist updated successfully"
  );

  return {
    success: true
  };
}
