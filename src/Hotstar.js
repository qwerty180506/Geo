// Constants
const PLAYLIST_URL = "https://premiumplugx.com/htt/hot.php?playlist=1";

// GitHub output file
const OUTPUT_PATH = "Hotstar.m3u";

// ============================================================
// EXACT CHANNELS TO KEEP
// ============================================================

const REQUIRED_CHANNELS = [
  "Star Vijay Digital",
  "Vijay Super Digital",
  "Star Sports 1 Tamil Digital",
  "Star Sports 2 Tamil Digital",
  "Star Sports 1 Digital",
  "Star Sports 2 Digital",
  "Star Sports Select 1 Digital",
  "Star Sports Select 2 Digital",
  "Star Sports Khel Digital"
];

// ============================================================
// FETCH SOURCE PLAYLIST
// ============================================================

async function fetchPlaylist() {
  const response = await fetch(
    `${PLAYLIST_URL}${PLAYLIST_URL.includes("?") ? "&" : "?"}t=${Date.now()}`,
    {
      headers: {
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      `Playlist request failed: ${response.status}`
    );
  }

  return await response.text();
}

// ============================================================
// PARSE M3U CHANNEL BLOCKS
// ============================================================

function parseM3U(text) {
  const lines = text.split(/\r?\n/);

  const channels = [];

  let currentBlock = null;

  for (const line of lines) {
    // Every channel begins with #EXTINF
    if (line.startsWith("#EXTINF")) {
      // Save previous channel
      if (currentBlock) {
        channels.push(currentBlock);
      }

      // Extract tvg-name
      let match = line.match(/tvg-name="([^"]*)"/i);
      let tvgName = match ? match[1].trim() : "";

      // Remove " by @rtxcric" and any leading/trailing space around it
      tvgName = tvgName.replace(/\s*by\s*@rtxcric/gi, '').trim();

      // Update the #EXTINF line to reflect the cleaned tvg-name
      const updatedLine = line.replace(/tvg-name="([^"]*)"/i, `tvg-name="${tvgName}"`);

      currentBlock = {
        tvgName, // The cleaned name
        lines: [updatedLine], // The updated line with cleaned name
      };

      continue;
    }

    // Add every following line to the current channel
    if (currentBlock) {
      currentBlock.lines.push(line);
    }
  }

  // Save the final channel
  if (currentBlock) {
    channels.push(currentBlock);
  }

  return channels;
}

// ============================================================
// EXACT CHANNEL MATCH
// ============================================================

function isRequiredChannel(tvgName) {
  const normalizedName = tvgName.trim().toLowerCase();
  return REQUIRED_CHANNELS.some((requiredName) =>
    normalizedName === requiredName.trim().toLowerCase()
  );
}

// ============================================================
// CLEAN M3U LINES
// ============================================================

function cleanLine(line) {
  return line
    .trim()
    .replace(/\\:/g, ":")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\&/g, "&");
}

function cleanUrl(line) {
  let url = line.trim();

  // Remove markdown format
  const markdownMatch = url.match(/^\[([^\]]+)\]\((.+)\)$/);
  if (markdownMatch) {
    url = markdownMatch[1];
  }

  // Only process if URL ends in .mpd
  if (url.endsWith(".mpd")) {
    url = url.split("?")[0]; // Remove query parameters
    url = url.split("|")[0];  // Remove pipe-based fragments
  }

  return url;
}

// ============================================================
// NORMALIZE A CHANNEL
// ============================================================

function normalizeChannel(channel) {
  const output = [];

  for (let line of channel.lines) {
    line = line.trim();

    if (!line) {
      continue;
    }

    // #EXTINF
    if (line.startsWith("#EXTINF")) {
      output.push(cleanLine(line));
      continue;
    }

    // #KODIPROP processing
    if (line.startsWith("#KODIPROP")) {
      const parts = line.split(/:/);

      if (parts[0] === "#KODIPROP") {
        if (!parts[1]) {
          output.push("#KODIPROP:inputstream=inputstream.adaptive");
        } else if (parts[1] === "inputstream") {
          output.push("#KODIPROP:inputstream=inputstream.adaptive");
        } else if (parts[1] === "inputstream.adaptive") {
          output.push("#KODIPROP:inputstream.adaptive.manifest_type=mpd");
        } else if (parts[1].includes("license_type")) {
          output.push("#KODIPROP:inputstream.adaptive.license_type=org.w3.clearkey");
        } else if (parts[1].includes("license_key")) {
          const keyLine = cleanLine(line);
          const keyParts = keyLine.split("=");
          if (keyParts.length > 1) {
            const value = keyParts[1];
            output.push(`#KODIPROP:inputstream.adaptive.license_key=${value}`);
          }
        } else {
          output.push(cleanLine(line));
        }
        continue;
      }
    }

    // #EXTVLCOPT processing
    if (line.startsWith("#EXTVLCOPT")) {
      const parts = line.split(":");
      if (parts[0] === "#EXTVLCOPT") {
        let prop = parts[1];
        if (prop === "http-extra-headers") {
          prop = "http-origin";
        }
        output.push(`#EXTVLCOPT:${prop}=https://www.hotstar.com`);
      } else {
        output.push(cleanLine(line));
      }
      continue;
    }

    // Other M3U directives
    if (line.startsWith("#")) {
      output.push(cleanLine(line));
      continue;
    }

    // Stream URL
    output.push(cleanUrl(line));
  }

  return output.join("\n");
}

// ============================================================
// GENERATE FILTERED M3U
// ============================================================

async function generateM3U() {
  const now = new Date().toISOString();

  console.log("Generating filtered playlist:", now);

  const source = await fetchPlaylist();

  const channels = parseM3U(source);

  console.log("Total source channels:", channels.length);

  const selected = channels.filter((channel) =>
    isRequiredChannel(channel.tvgName)
  );

  console.log("Selected channels:", selected.length);

  const output = [
    "#EXTM3U",
    // --- MODIFICATION START ---
    "# JHS Channels - Credits",
    "# Playlist Created By Premium Plug X",
    "# All Channels Sourced & Curated By @rtxcric",
    // --- MODIFICATION END ---
    `# Generated At: ${now}`,
    "",
  ];

  for (const channel of selected) {
    output.push(normalizeChannel(channel));
    output.push("");
  }

  return output.join("\n");
}

// ============================================================
// BASE64 Encoding
// ============================================================

function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

// ============================================================
// GITHUB UPLOAD
// ============================================================

async function uploadToGitHub(content, env) {
  const api = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${OUTPUT_PATH}`;

  let sha;

  // Get existing file to get SHA
  const oldFile = await fetch(api, {
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "User-Agent": "Cloudflare-Worker",
    },
  });

  if (oldFile.ok) {
    try {
      const oldJson = await oldFile.json();
      sha = oldJson.sha;
    } catch (e) {
      console.log("Could not read existing SHA");
    }
  }

  // Upload new version
  const body = {
    message: "Auto update selected M3U channels",
    content: toBase64(content),
  };

  if (sha) {
    body.sha = sha;
  }

  const upload = await fetch(api, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "Cloudflare-Worker",
    },
    body: JSON.stringify(body),
  });

  const result = await upload.text();

  console.log("GitHub Upload:", upload.status);
  console.log(result);

  if (!upload.ok) {
    throw new Error(`GitHub upload failed: ${upload.status}`);
  }
}

// ============================================================
// EXPORTED FUNCTION
// ============================================================

export async function runChannelFilter(env) {
  const m3u = await generateM3U();
  await uploadToGitHub(m3u, env);
  return m3u;
}

// ============================================================
// CLOUDFLARE WORKER ENTRY POINT
// ============================================================

export default {
  async fetch(request, env) {
    try {
      const m3u = await runChannelFilter(env);
      return new Response(
        m3u,
        {
          status: 200,
          headers: {
            "Content-Type": "application/x-mpegURL; charset=utf-8",
            "Cache-Control": "no-cache, no-store, must-revalidate",
          },
        }
      );
    } catch (error) {
      console.error(error);
      return new Response(
        JSON.stringify({
          error: error.message,
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }
  },
};
