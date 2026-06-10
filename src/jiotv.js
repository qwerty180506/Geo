const CHANNELS_URL =
  "https://allinonereborn.online/jtv-fetch/jstr4web.json";

const COOKIE_URL =
  "https://allinonereborn.online/jstrweb2/cookies.json";

const SPORTS_URL =
  "https://allinonereborn.online/jtv-fetch/jstarcookie/cookie.json";

// ---------------- BASE64 ----------------
function toBase64(str) {
  const bytes = new TextEncoder().encode(str);

  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary);
}

// ---------------- GET NORMAL COOKIE ----------------
async function getNormalCookie() {
  const res = await fetch(
    `${COOKIE_URL}?t=${Date.now()}`,
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

  const data = await res.json();

  const cookieObj = data.find(
    (x) => x.cookie
  );

  return cookieObj?.cookie || "";
}

// ---------------- GET SPORTS DATA ----------------
async function getSportsData() {
  const res = await fetch(
    `${SPORTS_URL}?t=${Date.now()}`,
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

  const data = await res.json();

  const sportsCookies = {};
  const sportsIds = new Set();

  const allChannels = [
    ...(data.successful_results || []),
    ...(data.failed_results || [])
  ];

  for (const item of allChannels) {
    const channelId = String(item.channel_id);

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

  return {
    sportsIds,
    sportsCookies,
  };
}

// ---------------- CHANNEL -> M3U ----------------
function createChannelEntry(
  channel,
  cookie
) {
  const id = channel.id || "";
  const name = channel.name || "";
  const logo = channel.logo || "";
  const group =
    channel.category || "Other";

  const url = channel.url || "";

  const keyId = channel.keyId || "";
  const key = channel.key || "";

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
    channelsRes,
    normalCookie,
    sportsData,
  ] = await Promise.all([
    fetch(
      `${CHANNELS_URL}?t=${Date.now()}`,
      {
        cf: {
          cacheTtl: 0,
          cacheEverything: false,
        },
      }
    ),
    getNormalCookie(),
    getSportsData(),
  ]);

  const channels =
    await channelsRes.json();

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
        "Channel Error:",
        channel.id,
        e
      );
    }
  }

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

  const existing =
    await fetch(api, {
      headers: {
        Authorization:
          `Bearer ${env.GITHUB_TOKEN}`,
      },
    });

  if (existing.ok) {
    try {
      const json =
        await existing.json();
      sha = json.sha;
    } catch {}
  }

  const upload =
    await fetch(api, {
      method: "PUT",
      headers: {
        Authorization:
          `Bearer ${env.GITHUB_TOKEN}`,
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify({
        message:
          "Auto update playlist",
        content:
          toBase64(content),
        sha,
      }),
    });

  if (!upload.ok) {
    throw new Error(
      await upload.text()
    );
  }
}

// ---------------- MAIN ----------------
export async function runJioTV(
  env
) {
  const m3u =
    await generateM3U();

  await uploadToGitHub(
    m3u,
    env
  );

  return {
    success: true,
  };
}
