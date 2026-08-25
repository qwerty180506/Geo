// mergePlaylist.js
const SOURCE_URLS = {
  gist: "https://gist.githubusercontent.com/Jaidev1805/fe6b7e724666e5ae0940104e22fe4872/raw/playlist.m3u",
  fancode: "https://raw.githubusercontent.com/qwerty180506/Geo/refs/heads/main/fancode_1080p.m3u",
  bexo: "https://raw.githubusercontent.com/drmlive/sliv-live-events/refs/heads/main/sonyliv.m3u",
  local: "https://raw.githubusercontent.com/amazeyourself/tamil-local-iptv/refs/heads/main/channels.m3u",
  sonyliv: "https://cloudplay-sonyliv.pages.dev/sony.m3u",
  sunnxt: "https://raw.githubusercontent.com/qwerty180506/Geo/refs/heads/main/sunnxt.m3u",
  times: "https://raw.githubusercontent.com/SonyIPTV/Sony-IPTV-Live/refs/heads/main/Sony%20IPTV%20Live.m3u",
  jiotvplus: "https://raw.githubusercontent.com/qwerty180506/Geo/refs/heads/main/jiotv_cf.m3u",
  jiotv: "https://raw.githubusercontent.com/qwerty180506/Geo/refs/heads/main/jiotv2.m3u"
};

const PRIORITY_ORDER = [
  "jiotv",
  "jiotvplus",
  "sonyliv",
  "sunnxt",
  "times",
];

const WANTED_MAP = {
  "Sun TV HD - Dolby Vision": ["Entertainment", "sunnxt"],
  "Sun News": ["News", "sunnxt"],
  "Jaya TV HD": "Entertainment",
  "J Movies": "Movies",
  "Jaya Max": "Music",
  "Sun TV HD": ["Entertainment", "sunnxt"],
  "Jaya Plus": "News",
  "Animal Planet HD Tamil": "Infortainment",
  "Cartoon Network Tamil": "Kids",
  "Chutti TV": "Kids",
  "Disney Channel": ["Kids", "jiotvplus"],
  "Sony Yay": ["Kids","jiotvplus"],
  "Hungama": ["Kids", "jiotv"],
  "Cartoon Network HD+ Tamil": "Kids",
  "Sonic Tamil": ["Kids", "jiotv"],
  "Discovery Kids Tamil": "Kids",
  "Nick Tamil": ["Kids", "jiotv"],
  "Pogo Tamil": "Kids",
  "Movies Now HD": ["Movies", "times"],
  "MNX HD": ["Movies", "times"],
  "MN+": ["Movies", "times"],
  "Vijay Takkar": ["Music", "jiotv"],
  "Vijay Super HD": "Movies",
  "Colors Infinity HD": "Movies",
  "Star Movies HD": ["Movies","jiotvplus"],
  "Star Movies Select HD": ["Movies","jiotvplus"],
  "Colors Tamil HD": ["Entertainment", "jiotvplus"],
  "Star Vijay HD": ["Entertainment", "jiotvplus"],
  "Thanthi One": ["Entertainment", "jiotv"],
  "Zee Tamil HD": "Entertainment",
  "Zee Thirai HD": "Movies",
  "Sony PIX HD": "Movies",
  "Kalaignar TV": "Entertainment",
  "Raj TV": "Entertainment",
  "Adithya TV": "Entertainment",
  "Polimer TV": ["Entertainment", "jiotv"],
  "Vasanth TV": "Entertainment",
  "Vendhar TV": "Entertainment",
  "Peppers TV": "Entertainment",
  "Vaanavil TV": "Entertainment",
  "Puthu Yugam": "Entertainment",
  "Makkal TV": "Entertainment",
  "Suriya TV": "Entertainment",
  "Sirippoli": "Entertainment",
  "KTV HD": ["Movies","sunnxt"],
  "Roja Movies": "Movies",
  "Tata Play Tamil Classics": "Movies",
  "Sun Life": "Movies",
  "Raj Digital Plus": "Movies",
  "Tunes 6": "Music",
  "Sun Music HD": "Music",
  "Raj Musix": "Music",
  "Isaiaruvi": "Music",
  "MK Six": "Music",
  "DD Sports": "Sports",
  "Eurosport HD": "Sports",
  "Star Sports Khel": "Sports",
  "Kalaignar Seithigal": "News",
  "News7 Tamil": ["News", "jiotv"],
  "News J": "News",
  "Win TV": "News",
  "News Tamil 24x7": "News",
  "Polimer News": "News",
  "Thanthi TV": ["News", "jiotv"],
  "Malaimurasu Seithigal": "News",
  "Puthiya Thalimurai": ["News", "jiotv"],
  "Velicham Tv": "News",
  "Raj News 24x7": ["News", "jiotv"],
  "Sathiyam TV": "News",
  "Madhimugam TV": "News",
  "M Nadu": "News",
  "Firstpost": ["News", "jiotv"],
  "NDTV 24x7": "News",
  "India Today": "News",
  "CNN": "News",
  "Times NOW": "News",
  "Wion": "News",
  "Discovery Turbo": "Infortainment",
  "Discovery Science English": "Infortainment",
  "Discovery HD Tamil": "Infortainment",
  "D Tamil": "Infortainment",
  "History TV18 HD Tamil": ["Infortainment", "jiotv"],
  "Nat Geo Wild HD": ["Infortainment", "jiotv"],
  "National Geographic HD": ["Infortainment", "jiotv"],
  "Travelxp HD": "Infortainment",
  "Travelxp Tamil": "Infortainment",
  "Sony BBC Earth HD": "Infortainment",
  "Sony Ten 1 HD": ["Sports", "sonyliv"],
  "Sony Ten 2 HD": ["Sports", "sonyliv"],
  "Sony Ten 3 HD": ["Sports", "sonyliv"],
  "Sony Ten 4 HD": ["Sports", "sonyliv"],
  "Sony Ten 4": ["Sports", "sonyliv"],
  "Sony Ten 5 HD": ["Sports", "sonyliv"],
  "Star Sports 1 Tamil HD": ["Sports", "jiotvplus"],
  "Star Sports 2 Tamil HD": ["Sports", "jiotvplus"],
  "Star Sports 1 HD": ["Sports", "jiotvplus"],
  "Star Sports 2 HD": ["Sports", "jiotvplus"],
  "Star Sports Select 1 HD": ["Sports", "jiotvplus"],
  "Star Sports Select 2 HD": ["Sports", "jiotvplus"]
};

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseM3U(content) {
  const lines = content.split(/\r?\n/);

  const channels = {};
  let buffer = [];

  for (const raw of lines) {
    let line = raw.trim();

    if (!line || line.startsWith("#EXTM3U")) {
      continue;
    }

    if (line.startsWith("#")) {
      buffer.push(line);
      continue;
    }

    let finalBuffer = [...buffer];

    // Extract stream headers (like Cookie) from KODIPROP tags
    let cookieValue = null;
    finalBuffer = finalBuffer.filter(tag => {
      if (tag.startsWith("#KODIPROP:inputstream.adaptive.stream_headers=")) {
        const headerContent = tag.replace("#KODIPROP:inputstream.adaptive.stream_headers=", "");
        if (headerContent.startsWith("Cookie=")) {
          cookieValue = headerContent.replace("Cookie=", "");
        }
        return false; // Remove stream_headers tag from buffer
      }
      return true;
    });

    // Append the token to the URL if a cookie header was found
    if (cookieValue) {
      const separator = line.includes("?") ? "&" : "?";
      line = `${line}${separator}${cookieValue}`;
    }

    const hasMpdProp = finalBuffer.some(tag =>
      tag.includes("inputstream.adaptive.manifest_type=mpd")
    );

    if (hasMpdProp && !/\.mpd(\?|$)/i.test(line)) {
      finalBuffer = finalBuffer.filter(
        tag => !tag.startsWith("#KODIPROP:inputstream.adaptive.")
      );
    }

    let name = null;

    for (const tag of finalBuffer) {
      if (tag.startsWith("#EXTINF") && tag.includes(",")) {
        name = tag.substring(tag.indexOf(",") + 1).trim();
        break;
      }
    }

    if (name) {
      channels[name] = [...finalBuffer, line].join("\n");
    }
    buffer = [];
  }

  return channels;
}

function safeMatch(requested, data) {
  for (const [key, value] of Object.entries(data)) {
    if (key.toLowerCase() === requested.toLowerCase()) {
      return value;
    }
  }

  const regex = new RegExp(
    `\\b${escapeRegex(requested)}\\b`,
    "i"
  );

  for (const [key, value] of Object.entries(data)) {
    if (regex.test(key)) {
      return value;
    }
  }

  return null;
}

async function fetchSources() {
  const result = {};

  for (const [key, url] of Object.entries(SOURCE_URLS)) {
    try {
      const headers = {
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
      };

      if (key === "jiotv") {
        headers["Referer"] = "https://sflexzio.pages.dev";
        headers["Origin"] = "https://sflexzio.pages.dev";
      }

      const response = await fetch(`${url}?t=${Date.now()}`, { headers });

      result[key] = await response.text();
      console.log(
        `Downloaded ${key}: ${response.status}`
      );
    } catch (err) {
      console.log(
        `Failed downloading ${key}:`,
        err.toString()
      );

      result[key] = "";
    }
  }

  return result;
}

async function uploadToGist(content, env) {
  const response = await fetch(
    `https://api.github.com/gists/${env.GIST_ID}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `token ${env.GIST_TOKEN}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "Cloudflare-Worker",
      },
      body: JSON.stringify({
        files: {
          "playlist.m3u": {
            content,
          },
        },
      }),
    }
  );

  const text = await response.text();

  console.log("Gist Upload:", response.status);
  console.log(text);

  if (!response.ok) {
    throw new Error(
      `Gist upload failed: ${response.status} - ${text}`
    );
  }
  }

export async function runMerge(env) {
  console.log("Starting playlist merge...");

  const files = await fetchSources();

  const base = parseM3U(files.gist);

  const sources = {
    fancode: parseM3U(files.fancode),
    bexo: parseM3U(files.bexo),
    sonyliv: parseM3U(files.sonyliv),
    sunnxt: parseM3U(files.sunnxt),
    times: parseM3U(files.times),
    jiotv: parseM3U(files.jiotv),
    jiotvplus: parseM3U(files.jiotvplus),
    local: parseM3U(files.local),
  };

  console.log(
    `Base playlist channels: ${Object.keys(base).length}`
  );


  for (const [name, value] of Object.entries(WANTED_MAP)) {
    let category;
    let preferred;

    if (Array.isArray(value)) {
      [category, preferred] = value;
    } else {
      category = value;
      preferred = null;
    }

    let found = null;
    let foundSource = null;

    if (
      preferred &&
      sources[preferred]
    ) {
      found = safeMatch(
        name,
        sources[preferred]
      );

      if (found) {
        foundSource = preferred;
      }
    }

    if (!found) {
      for (const src of PRIORITY_ORDER) {
        found = safeMatch(
          name,
          sources[src]
        );

        if (found) {
          foundSource = src;
          break;
        }
      }
    }

    if (found) {
      const clean = found.replace(
        /group-title="[^"]*"/g,
        ""
      );

      const fixed = clean.replace(
        "#EXTINF:-1",
        `#EXTINF:-1 group-title="${category}"`
      );

      base[name] = fixed;

      console.log(
        `✓ ${name} -> ${foundSource}`
      );
    } else {
      console.log(
        `✗ ${name} -> NOT FOUND`
      );
    }
  }

  // Local channels
  for (const [name, content] of Object.entries(
    sources.local
  )) {
    const clean = content.replace(
      /group-title="[^"]*"/g,
      ""
    );

    base[`Local_${name}`] = clean.replace(
      "#EXTINF:-1",
      '#EXTINF:-1 group-title="Local Channels"'
    );
  }

  console.log(
    `Added ${Object.keys(sources.local).length} local channels`
  );

  // Fancode channels
  const fancodeLines = files.fancode
    .split(/\r?\n/)
    .map(x => x.trim())
    .filter(Boolean);

  for (
    let i = 0;
    i < fancodeLines.length;
    i++
  ) {
    const line = fancodeLines[i];

    if (
      line.startsWith("#EXTINF") &&
      i + 1 < fancodeLines.length
    ) {
      const urlLine =
        fancodeLines[i + 1];

      if (urlLine.startsWith("#")) {
        continue;
      }

      base[`Fancode_${i}`] =
        line + "\n" + urlLine;

      i++;
    }
  }

  console.log("Added Fancode events");

  // SonyLiv live events
  for (const [name, content] of Object.entries(
    sources.bexo
  )) {
    const clean = content.replace(
      /group-title="[^"]*"/g,
      ""
    );

    base[`SonyLiv_${name}`] =
      clean.replace(
        "#EXTINF:-1",
        '#EXTINF:-1 group-title="SonyLiv Live Events"'
      );
  }

  console.log(
    "Added SonyLiv live events"
  );

  let playlist = "#EXTM3U\n";

  const values = Object.values(base).sort();

  for (const item of values) {
    playlist += item + "\n";
  }

  console.log(
    `Final playlist entries: ${values.length}`
  );

  console.log(
  "Playlist size:",
  new TextEncoder().encode(playlist).length,
  "bytes"
  );
  
  await uploadToGist(
    playlist,
    env
  );

  console.log(
    "Playlist merge completed successfully"
  );
}
