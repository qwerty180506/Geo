const PLAYLIST_URL = "https://premiumplugx.com/jhs/hotstar.json";
const OUTPUT_PATH = "Hotstar.m3u";
const DEBUG_MODE = false;


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
// FETCH SOURCE JSON
// ============================================================

async function fetchPlaylist() {

  const url =
    `${PLAYLIST_URL}${PLAYLIST_URL.includes("?") ? "&" : "?"}t=${Date.now()}`;

  if (DEBUG_MODE) {
    console.log("Fetching:", url);
  }

  const response = await fetch(url, {
    headers: {
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
      "Accept": "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(
      `JSON request failed: ${response.status} ${response.statusText}`
    );
  }

  const text = await response.text();

  if (!text.trim()) {
    throw new Error("Source JSON is empty");
  }

  let data;

  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `Failed to parse source JSON: ${error.message}`
    );
  }

  if (!Array.isArray(data)) {
    throw new Error(
      "Source JSON does not contain an array of channels"
    );
  }

  return data;
}


// ============================================================
// EXACT CHANNEL MATCH
// ============================================================

function isRequiredChannel(name) {

  if (!name) {
    return false;
  }

  const normalizedName = name
    .trim()
    .toLowerCase();

  return REQUIRED_CHANNELS.some(
    (requiredName) =>
      normalizedName === requiredName.trim().toLowerCase()
  );
}


// ============================================================
// CLEAN TEXT
// ============================================================

function cleanText(value) {

  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value)
    .replace(/[\r\n]+/g, " ")
    .replace(/\|/g, " / ")
    .replace(/\s+/g, " ")
    .trim();
}


// ============================================================
// CLEAN M3U LINE
// ============================================================

function cleanLine(line) {

  return line
    .trim()
    .replace(/\\:/g, ":")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\&/g, "&")
    .replace(/\|/g, " / ");
}


// ============================================================
// CLEAN URL
// ============================================================

function cleanUrl(line) {

  if (!line) {
    return "";
  }

  let url = String(line).trim();

  // ----------------------------------------------------------
  // Remove markdown:
  // [Channel Name](https://example.com/channel.m3u8)
  // ----------------------------------------------------------

  const markdownMatch =
    url.match(/^\[([^\]]+)\]\((.+)\)$/);

  if (markdownMatch) {
    url = markdownMatch[2];
  }


  // ----------------------------------------------------------
  // Remove whitespace
  // ----------------------------------------------------------

  url = url.replace(/\s+/g, "");


  // ----------------------------------------------------------
  // MPD cleanup
  //
  // If the MPD URL contains:
  //
  // https://example.com/live.mpd?something
  //
  // or:
  //
  // https://example.com/live.mpd|something
  //
  // keep only the .mpd URL.
  // ----------------------------------------------------------

  const mpdParamsPattern =
    /(\.mpd)[\?|].*$/i;

  if (mpdParamsPattern.test(url)) {
    url = url.replace(
      mpdParamsPattern,
      "$1"
    );
  }


  if (DEBUG_MODE) {
    console.log(
      `[cleanUrl] ${url}`
    );
  }

  return url;
}


// ============================================================
// ESCAPE M3U ATTRIBUTE
// ============================================================

function escapeAttribute(value) {

  return cleanText(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;");
}


// ============================================================
// CREATE EXTINF
// ============================================================

function createExtinf(channel) {

  const name =
    cleanText(channel.name);

  const logo =
    cleanText(channel.logo);

  const group =
    cleanText(channel.group) ||
    "Live Events";

  let line =
    `#EXTINF:-1 ` +
    `tvg-name="${escapeAttribute(name)}" ` +
    `group-title="${escapeAttribute(group)}"`;

  if (logo) {
    line +=
      ` tvg-logo="${escapeAttribute(logo)}"`;
  }

  line += `,${name}`;

  return cleanLine(line);
}


// ============================================================
// NORMALIZE CHANNEL
// ============================================================

function normalizeChannel(channel) {

  const output = [];

  const name =
    cleanText(channel.name);

  const logo =
    cleanText(channel.logo);

  const group =
    cleanText(channel.group);

  const type =
    cleanText(channel.type).toLowerCase();

  const streamUrl =
    cleanUrl(channel.streamUrl);


  // ----------------------------------------------------------
  // Validate channel
  // ----------------------------------------------------------

  if (!name) {
    return "";
  }

  if (!streamUrl) {
    return "";
  }


  // ----------------------------------------------------------
  // EXTINF
  // ----------------------------------------------------------

  output.push(
    createExtinf({
      name,
      logo,
      group
    })
  );


  // ==========================================================
  // MPD / DASH
  // ==========================================================

  if (type === "mpd") {

    // InputStream Adaptive
    output.push(
      "#KODIPROP:inputstream=inputstream.adaptive"
    );


    // Manifest type
    output.push(
      "#KODIPROP:inputstream.adaptive.manifest_type=mpd"
    );


    // --------------------------------------------------------
    // ClearKey
    // --------------------------------------------------------

    const keyId =
      cleanText(channel.keyId);

    const key =
      cleanText(channel.key);


    if (keyId && key) {

      output.push(
        "#KODIPROP:inputstream.adaptive.license_type=org.w3.clearkey"
      );

      output.push(
        `#KODIPROP:inputstream.adaptive.license_key=${keyId}:${key}`
      );

    } else {

      if (DEBUG_MODE) {
        console.warn(
          `MPD channel has no keyId/key: ${name}`
        );
      }

    }
  }


  // ==========================================================
  // STREAM URL
  // ==========================================================

  output.push(streamUrl);


  if (DEBUG_MODE) {
    console.log(
      `Generated channel: ${name} [${type}]`
    );
  }


  return output.join("\n");
}


// ============================================================
// GENERATE FILTERED M3U
// ============================================================

async function generateM3U() {

  const now =
    new Date().toISOString();


  console.log(
    "Generating filtered playlist:",
    now
  );


  // ----------------------------------------------------------
  // FETCH JSON
  // ----------------------------------------------------------

  const channels =
    await fetchPlaylist();


  console.log(
    "Total source channels:",
    channels.length
  );


  // ----------------------------------------------------------
  // FILTER REQUIRED CHANNELS
  // ----------------------------------------------------------

  const selected =
    channels.filter((channel) =>
      isRequiredChannel(channel.name)
    );


  console.log(
    "Selected channels:",
    selected.length
  );


  // ----------------------------------------------------------
  // CREATE M3U HEADER
  // ----------------------------------------------------------

  const output = [

    "#EXTM3U",

    "# Hotstar Channels",

    "# Generated From Premium Plug X JSON",

    `# Generated At: ${now}`,

    ""

  ];


  // ----------------------------------------------------------
  // ADD CHANNELS
  // ----------------------------------------------------------

  for (const channel of selected) {

    const normalized =
      normalizeChannel(channel);


    if (!normalized) {

      console.warn(
        `Skipping invalid channel: ${
          channel.name || "Unknown"
        }`
      );

      continue;
    }


    output.push(normalized);

    output.push("");
  }


  // ----------------------------------------------------------
  // SAFETY CHECK
  // ----------------------------------------------------------

  if (selected.length === 0) {

    throw new Error(
      "No required channels were found in the source JSON."
    );

  }


  // ----------------------------------------------------------
  // RETURN COMPLETE M3U
  // ----------------------------------------------------------

  return output.join("\n");
}


// ============================================================
// BASE64 ENCODING
// ============================================================

function toBase64(str) {

  const bytes =
    new TextEncoder().encode(str);

  let binary = "";

  for (const byte of bytes) {
    binary +=
      String.fromCharCode(byte);
  }

  return btoa(binary);
}


// ============================================================
// GITHUB FILE SHA
// ============================================================

async function getGitHubFileSha(
  env,
  path
) {

  const api =
    `https://api.github.com/repos/` +
    `${env.GITHUB_OWNER}/` +
    `${env.GITHUB_REPO}/` +
    `/contents/${path}`;


  const response =
    await fetch(api, {

      headers: {

        Authorization:
          `Bearer ${env.GITHUB_TOKEN}`,

        "User-Agent":
          "Cloudflare-Worker",

        "Accept":
          "application/vnd.github+json"
      }

    });


  // ----------------------------------------------------------
  // Existing file
  // ----------------------------------------------------------

  if (response.ok) {

    const json =
      await response.json();

    return json.sha;
  }


  // ----------------------------------------------------------
  // File doesn't exist
  // ----------------------------------------------------------

  if (response.status === 404) {

    return null;
  }


  // ----------------------------------------------------------
  // Other error
  // ----------------------------------------------------------

  const errorBody =
    await response.text();


  throw new Error(
    `Failed to get GitHub file SHA for ${path}: ` +
    `${response.status} ` +
    `${response.statusText}. ` +
    `Response: ${errorBody}`
  );
}


// ============================================================
// GITHUB UPLOAD
// ============================================================

// ============================================================
// GITHUB UPLOAD - ROBUST 409 HANDLING
// ============================================================

async function uploadToGitHub(content, env) {

  const api =
    `https://api.github.com/repos/` +
    `${env.GITHUB_OWNER}/` +
    `${env.GITHUB_REPO}/` +
    `contents/${OUTPUT_PATH}`;

  const maxRetries = 5;

  let currentDelay = 1000;


  // ----------------------------------------------------------
  // RETRY LOOP
  // ----------------------------------------------------------

  for (
    let attempt = 1;
    attempt <= maxRetries;
    attempt++
  ) {

    console.log(
      `GitHub upload attempt ${attempt}/${maxRetries}`
    );


    try {

      // ------------------------------------------------------
      // GET THE LATEST FILE SHA
      // ------------------------------------------------------

      const sha =
        await getGitHubFileSha(
          env,
          OUTPUT_PATH
        );


      console.log(
        "Current GitHub SHA:",
        sha || "FILE DOES NOT EXIST"
      );


      // ------------------------------------------------------
      // BUILD REQUEST BODY
      // ------------------------------------------------------

      const body = {
        message:
          `Auto update Hotstar M3U - attempt ${attempt}`,

        content:
          toBase64(content)
      };


      // Existing file
      if (sha) {
        body.sha = sha;
      }


      // ------------------------------------------------------
      // UPLOAD TO GITHUB
      // ------------------------------------------------------

      const uploadResponse =
        await fetch(api, {

          method: "PUT",

          headers: {

            Authorization:
              `Bearer ${env.GITHUB_TOKEN}`,

            "Content-Type":
              "application/json",

            "User-Agent":
              "Cloudflare-Worker",

            "Accept":
              "application/vnd.github+json"

          },

          body:
            JSON.stringify(body)

        });


      console.log(
        `GitHub Upload Status: ${uploadResponse.status}`
      );


      // ------------------------------------------------------
      // SUCCESS
      // ------------------------------------------------------

      if (uploadResponse.ok) {

        console.log(
          "GitHub upload successful."
        );

        return;
      }


      // ------------------------------------------------------
      // 409 SHA CONFLICT
      // ------------------------------------------------------

      if (uploadResponse.status === 409) {

        const errorBody =
          await uploadResponse.text();

        console.warn(
          `GitHub SHA conflict on attempt ${attempt}.`
        );

        console.warn(
          `Response: ${errorBody}`
        );


        // If attempts remain, wait and then
        // fetch a completely fresh SHA.
        if (attempt < maxRetries) {

          console.log(
            `Retrying in ${currentDelay / 1000}s...`
          );


          await new Promise(
            (resolve) =>
              setTimeout(
                resolve,
                currentDelay
              )
          );


          currentDelay *= 2;

          continue;
        }


        throw new Error(
          `GitHub upload failed after ${maxRetries} ` +
          `attempts due to repeated SHA conflicts. ` +
          `Last response: ${errorBody}`
        );
      }


      // ------------------------------------------------------
      // OTHER GITHUB ERROR
      // ------------------------------------------------------

      const errorBody =
        await uploadResponse.text();


      throw new Error(
        `GitHub upload failed: ` +
        `${uploadResponse.status} ` +
        `${errorBody}`
      );


    } catch (error) {

      // ------------------------------------------------------
      // NETWORK / FETCH ERROR
      //
      // 409 errors are already handled above and continued.
      // This catch is therefore mainly for actual exceptions.
      // ------------------------------------------------------

      if (attempt >= maxRetries) {

        throw new Error(
          `Failed to upload to GitHub after ` +
          `${maxRetries} attempts: ` +
          `${error.message}`
        );
      }


      console.error(
        `GitHub upload error on attempt ${attempt}:`,
        error.message
      );


      console.log(
        `Retrying in ${currentDelay / 1000}s...`
      );


      await new Promise(
        (resolve) =>
          setTimeout(
            resolve,
            currentDelay
          )
      );


      currentDelay *= 2;
    }
  }
}

// ============================================================
// EXPORTED FUNCTION
// ============================================================

export async function runChannelFilter(env) {

  const m3u =
    await generateM3U();


  await uploadToGitHub(
    m3u,
    env
  );


  return m3u;
}


// ============================================================
// CLOUDFLARE WORKER ENTRY POINT
// ============================================================

export default {

  async fetch(request, env) {

    try {

      const m3u =
        await runChannelFilter(env);


      return new Response(
        m3u,

        {

          status: 200,

          headers: {

            "Content-Type":
              "application/x-mpegURL; charset=utf-8",

            "Cache-Control":
              "no-cache, no-store, must-revalidate"

          }

        }
      );

    } catch (error) {

      console.error(error);


      return new Response(

        JSON.stringify({
          error: error.message
        }),

        {

          status: 500,

          headers: {

            "Content-Type":
              "application/json"

          }

        }

      );
    }
  }
};
