const CHANNELS_URL =
  "https://allinonereborn.online/jtv-fetch/jstr4web.json";

const COOKIE_URL =
  "https://allinonereborn.online/jstrweb2/cookies.json";

const SPORTS_URL =
  "https://allinonereborn.online/jtv-fetch/jstarcookie/cookie.json";

// ---------------- HEADERS ----------------
const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/137.0.0.0 Safari/537.36",
  "Accept":
    "application/json,text/plain,*/*",
  "Cache-Control":
    "no-cache, no-store, must-revalidate",
  "Pragma":
    "no-cache",
  "Expires":
    "0",
};

// ---------------- BASE64 ----------------
function toBase64(str) {
  const bytes = new TextEncoder().encode(str);

  let binary = "";

  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary);
}

// ---------------- JSON FETCHER ----------------
async function getJson(url, name) {
  console.log(`===== ${name} =====`);

  const response = await fetch(
    `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`,
    {
      headers: FETCH_HEADERS,
      cf: {
        cacheTtl: 0,
        cacheEverything: false,
      },
    }
  );

  const text = await response.text();

  console.log(`${name} STATUS:`, response.status);
  console.log(
    `${name} CONTENT-TYPE:`,
    response.headers.get("content-type")
  );

  console.log(
    `${name} RESPONSE:`
  );

  console.log(
    text.substring(0, 1000)
  );

  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(
      `${name} INVALID JSON\n\n` +
      `STATUS: ${response.status}\n\n` +
      text.substring(0, 2000)
    );
  }
}

// ---------------- NORMAL COOKIE ----------------
async function getNormalCookie() {
  const data = await getJson(
    COOKIE_URL,
    "COOKIE"
  );

  const cookieObj = data.find(
    (x) => x.cookie
  );

  const cookie =
    cookieObj?.cookie || "";

  console.log(
    "NORMAL COOKIE FOUND:",
    !!cookie
  );

  return cookie;
}

// ---------------- SPORTS DATA ----------------
async function getSportsData() {
  const data = await getJson(
    SPORTS_URL,
    "SPORTS"
  );

  const sportsIds = new Set();

  const sportsCookies = {};

  const allChannels = [
    ...(data.successful_results || []),
    ...(data.failed_results || [])
  ];

  for (const item of allChannels) {
    const channelId =
      String(item.channel_id);

    sportsIds.add(channelId);

    const finalUrl =
      item?.url ||
      item?.final_url ||
      item?.error_details?.final_url ||
      "";

    const match =
      finalUrl.match(/\?(.*)$/);

    if (match) {
      sportsCookies[channelId] =
        match[1];
    }
  }

  console.log(
    "SPORTS CHANNELS:",
    sportsIds.size
  );

  return {
    sportsIds,
    sportsCookies,
  };
}

// ---------------- CHANNEL ENTRY ----------------
function createChannelEntry(
  channel,
  cookie
) {
  const id =
    channel.id || "";

  const name =
    channel.name || "";

  const logo =
    channel.logo || "";

  const group =
    channel.category || "Other";

  const url =
    channel.url || "";

  const keyId =
    channel.keyId || "";

  const key =
    channel.key || "";

  const lines = [];

  lines.push(
    `#EXTINF:-1 tvg-id="${id}" tvg-name="${name}" tvg-logo="${logo}" group-title="${group}",${name}`
  );

  lines.push(
    "#KODIPROP:inputstream.adaptive.manifest_type=mpd"
  );

  if (keyId && key) {
    lines.push(
      "#KODIPROP:inputstream.adaptive.license_type=clearkey"
    );

    lines.push(
      `#KODIPROP:inputstream.adaptive.license_key=${keyId}:${key}`
    );
  }

  lines.push(
    `${url}?${cookie}`
  );

  return lines.join("\n");
}

// ---------------- GENERATE M3U ----------------
async function generateM3U() {
  const now =
    new Date().toISOString();

  const [
    channels,
    normalCookie,
    sportsData,
  ] = await Promise.all([
    getJson(
      CHANNELS_URL,
      "CHANNELS"
    ),
    getNormalCookie(),
    getSportsData(),
  ]);

  console.log(
    "TOTAL CHANNELS:",
    channels.length
  );

  const results = [];

  for (const channel of channels) {
    try {
      const channelId =
        String(channel.id);

      let cookie =
        normalCookie;

      if (
        sportsData.sportsIds.has(
          channelId
        )
      ) {
        cookie =
          sportsData.sportsCookies[
            channelId
          ] || normalCookie;
      }

      results.push(
        createChannelEntry(
          channel,
          cookie
        )
      );
    } catch (e) {
      console.log(
        "CHANNEL ERROR:",
        channel.id,
        e.toString()
      );
    }
  }

  console.log(
    "M3U CHANNELS GENERATED:",
    results.length
  );

  return [
    "#EXTM3U",
    `# Updated: ${now}`,
    "",
    ...results,
  ].join("\n\n");
}

// ---------------- GITHUB UPLOAD ----------------
async function uploadToGitHub(
  content,
  env
) {
  const path =
    "jiotv_cf.m3u";

  const api =
    `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`;

  let sha;

  console.log(
    "CHECKING EXISTING FILE..."
  );

  const existing =
    await fetch(api, {
      headers: {
        Authorization:
          `Bearer ${env.GITHUB_TOKEN}`,
        "User-Agent":
          "Cloudflare-Worker",
      },
    });

  if (existing.ok) {
    try {
      const json =
        await existing.json();

      sha = json.sha;

      console.log(
        "EXISTING SHA:",
        sha
      );
    } catch (e) {
      console.log(
        "SHA READ FAILED"
      );
    }
  }

  console.log(
    "UPLOADING TO GITHUB..."
  );

  const upload =
    await fetch(api, {
      method: "PUT",
      headers: {
        Authorization:
          `Bearer ${env.GITHUB_TOKEN}`,
        "Content-Type":
          "application/json",
        "User-Agent":
          "Cloudflare-Worker",
      },
      body: JSON.stringify({
        message:
          `Auto update playlist ${new Date().toISOString()}`,
        content:
          toBase64(content),
        sha,
      }),
    });

  const responseText =
    await upload.text();

  console.log(
    "UPLOAD STATUS:",
    upload.status
  );

  console.log(
    "UPLOAD RESPONSE:"
  );

  console.log(
    responseText.substring(
      0,
      1000
    )
  );

  if (!upload.ok) {
    throw new Error(
      responseText
    );
  }
}

// ---------------- MAIN ----------------
export async function runJioTV(
  env
) {
  try {
    console.log(
      "STARTING UPDATE..."
    );

    const m3u =
      await generateM3U();

    console.log(
      "M3U SIZE:",
      m3u.length
    );

    await uploadToGitHub(
      m3u,
      env
    );

    console.log(
      "UPDATE SUCCESS"
    );

    return {
      success: true,
    };
  } catch (e) {
    console.log(
      "FATAL ERROR:"
    );

    console.log(
      e.toString()
    );

    throw e;
  }
}
