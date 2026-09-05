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
      // Ensure the *last* comma-separated part (the channel name for display) is also cleaned
      const commaIndex = line.lastIndexOf(',');
      let updatedLine = line;
      if (commaIndex !== -1) {
          const preComma = line.substring(0, commaIndex + 1); // Including the comma
          const postComma = line.substring(commaIndex + 1).replace(/\s*by\s*@rtxcric/gi, '').trim();
          updatedLine = preComma + postComma;
      }
      updatedLine = updatedLine.replace(/tvg-name="([^"]*)"/i, `tvg-name="${tvgName}"`);

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

  // Remove markdown format like [Channel Name](URL)
  const markdownMatch = url.match(/^\[([^\]]+)\]\((.+)\)$/);
  if (markdownMatch) {
    url = markdownMatch[2]; // Correctly extract the URL part
  }

  // Only process if URL ends in .mpd
  if (url.endsWith(".mpd")) {
    // Remove query parameters starting with '?'
    // and pipe-based fragments starting with '|'
    // The order matters: first remove '?' if it exists, then '|'
    // E.g., 'url.mpd?param=val|fragment' -> 'url.mpd'
    // E.g., 'url.mpd|fragment?param=val' -> 'url.mpd|fragment' (then second split gets it)
    // E.g., 'url.mpd?|fragment' -> 'url.mpd' (this specific case for the user's input)

    const questionMarkIndex = url.indexOf('?');
    const pipeIndex = url.indexOf('|');

    // Find the earliest index of '?' or '|'
    let truncateIndex = -1;
    if (questionMarkIndex !== -1) {
        truncateIndex = questionMarkIndex;
    }
    if (pipeIndex !== -1 && (truncateIndex === -1 || pipeIndex < truncateIndex)) {
        truncateIndex = pipeIndex;
    }

    if (truncateIndex !== -1) {
        url = url.substring(0, truncateIndex);
    }
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

    // #EXTINF: Cleaned tvg-name is already applied in parseM3U
    if (line.startsWith("#EXTINF")) {
      output.push(cleanLine(line)); // Only apply basic line cleaning for escapes
      continue;
    }

    // #KODIPROP processing
    if (line.startsWith("#KODIPROP")) {
      const parts = line.split(":"); // Split by first colon to separate directive from content

      if (parts[0] === "#KODIPROP") {
        const propAndValue = parts.slice(1).join(":"); // Rejoin for properties that have colons in their value
        if (!propAndValue) {
          output.push("#KODIPROP:inputstream=inputstream.adaptive");
        } else if (propAndValue === "inputstream") {
          output.push("#KODIPROP:inputstream=inputstream.adaptive");
        } else if (propAndValue === "inputstream.adaptive") {
          output.push("#KODIPROP:inputstream.adaptive.manifest_type=mpd");
        } else if (propAndValue.startsWith("inputstream.adaptive.license_type")) {
          // Ensure specific license type is outputted
          output.push("#KODIPROP:inputstream.adaptive.license_type=org.w3.clearkey");
        } else if (propAndValue.startsWith("inputstream.adaptive.license_key")) {
          // For license_key, just ensure it's kept as is after the key
          const keyMatch = propAndValue.match(/^inputstream\.adaptive\.license_key=(.*)/);
          if (keyMatch && keyMatch[1]) {
            output.push(`#KODIPROP:inputstream.adaptive.license_key=${keyMatch[1]}`);
          } else {
            // Fallback for unexpected format, keep the original cleaned line
            output.push(cleanLine(line));
          }
        } else {
          // For other KODIPROP properties, keep them as they are after basic cleaning
          output.push(cleanLine(line));
        }
      }
      continue;
    }

    // #EXTVLCOPT processing
    if (line.startsWith("#EXTVLCOPT")) {
      const equalIndex = line.indexOf('=');
      if (equalIndex === -1) {
        output.push(cleanLine(line)); // Not a key=value pair (or unexpected format), just push
        continue;
      }

      let propName = line.substring("#EXTVLCOPT:".length, equalIndex).trim().toLowerCase();
      let propValue = line.substring(equalIndex + 1).trim();

      // Normalize Origin header
      if (propName === "http-extra-headers" || propName === "origin" || propName.includes("origin")) {
        output.push("#EXTVLCOPT:http-origin=https://www.hotstar.com");
      }
      // Normalize Referer header
      else if (propName === "http-referrer" || propName === "http-referer") {
        output.push("#EXTVLCOPT:http-referrer=https://www.hotstar.com");
      }
      // For other headers like user-agent or cookie, remove trailing "=https://www.hotstar.com" if present
      else if (propValue.endsWith("=https://www.hotstar.com")) {
        // Extract the actual value by removing the trailing part
        propValue = propValue.substring(0, propValue.lastIndexOf("=https://www.hotstar.com"));
        output.push(`#EXTVLCOPT:${propName}=${propValue}`);
      }
      else {
        // For any other EXTVLCOPT lines, keep them as is after basic cleaning
        output.push(cleanLine(line));
      }
      continue;
    }

    // #EXTHTTP: Remove completely as EXTVLCOPT should handle headers consistently
    if (line.startsWith("#EXTHTTP")) {
      continue; // Skip these lines entirely
    }

    // Other M3U directives (including non-Hotstar specific ones)
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
    "# JHS Channels - Credits",
    "# Playlist Created By Premium Plug X",
    "# All Channels Sourced & Curated By @rtxcric",
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
// GITHUB UPLOAD - ROBUSTIFIED
// ============================================================

/**
 * Fetches the current SHA of a file from GitHub.
 * @param {object} env - The Cloudflare Worker environment variables.
 * @param {string} path - The path to the file on GitHub.
 * @returns {Promise<string|null>} The SHA of the file, or null if not found.
 * @throws {Error} If fetching SHA fails for reasons other than 404.
 */
async function getGitHubFileSha(env, path) {
  const api = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`;
  const response = await fetch(api, {
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "User-Agent": "Cloudflare-Worker",
    },
  });

  if (response.ok) {
    const json = await response.json();
    return json.sha;
  } else if (response.status === 404) {
    return null; // File does not exist, will be created
  } else {
    const errorBody = await response.text();
    throw new Error(`Failed to get GitHub file SHA for ${path}: ${response.status} ${response.statusText}. Response: ${errorBody}`);
  }
}

/**
 * Uploads content to GitHub, with retry logic for conflicts and network errors.
 * @param {string} content - The content to upload.
 * @param {object} env - The Cloudflare Worker environment variables.
 * @throws {Error} If upload fails after all retries.
 */
async function uploadToGitHub(content, env) {
  const api = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${OUTPUT_PATH}`;
  const maxRetries = 3;
  let currentDelay = 1000; // Start with 1 second delay

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Fetch the latest SHA before EACH attempt to ensure we have the most current version
      const sha = await getGitHubFileSha(env, OUTPUT_PATH);

      const body = {
        message: `Auto update selected M3U channels (attempt ${attempt + 1})`,
        content: toBase64(content),
      };

      if (sha) {
        body.sha = sha; // Include SHA for updates to prevent 409 if file exists
      }
      // If sha is null, the file doesn't exist, and we proceed without sha to create it.

      const uploadResponse = await fetch(api, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          "Content-Type": "application/json",
          "User-Agent": "Cloudflare-Worker",
        },
        body: JSON.stringify(body),
      });

      console.log(`GitHub Upload (Attempt ${attempt + 1}): Status ${uploadResponse.status}`);

      if (uploadResponse.ok) {
        const result = await uploadResponse.text();
        console.log("GitHub Upload Success:", result);
        return; // Success, exit the function
      } else if (uploadResponse.status === 409 && attempt < maxRetries) {
        // Conflict detected, retry
        console.warn(`Conflict (409) detected on GitHub upload. Retrying in ${currentDelay / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, currentDelay));
        currentDelay *= 2; // Exponential backoff
      } else {
        // Other errors or max retries reached for 409
        const errorResult = await uploadResponse.text();
        throw new Error(`GitHub upload failed: ${uploadResponse.status} ${uploadResponse.statusText}. Response: ${errorResult}`);
      }
    } catch (e) {
      if (attempt < maxRetries) {
        // Catch network errors during fetch or JSON parsing errors
        console.error(`Error during GitHub upload (Attempt ${attempt + 1}): ${e.message}. Retrying in ${currentDelay / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, currentDelay));
        currentDelay *= 2; // Exponential backoff
      } else {
        throw new Error(`Failed to upload to GitHub after ${maxRetries + 1} attempts: ${e.message}`);
      }
    }
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
