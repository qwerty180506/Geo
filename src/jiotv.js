const M3U_URL = "https://noisy-truth-6766.streamstar18.workers.dev";

const HEADERS = {
  "User-Agent":
    "OTT Navigator/1.7.4.1 (Linux;Android 11)",
};

// ---------------- BASE64 SAFE ----------------
function toBase64(str) {
  const bytes = new TextEncoder().encode(str);

  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary);
}

// ---------------- FETCH M3U ----------------
async function fetchM3U() {
  const now = new Date().toISOString();

  console.log("Fetching playlist at:", now);

  const response = await fetch(
    `${M3U_URL}?t=${Date.now()}`,
    {
      headers: {
        ...HEADERS,
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      `Failed to fetch M3U: ${response.status}`
    );
  }

  const originalM3U = await response.text();

  return [
    "#EXTM3U",
    "#Credits 🙏: cloudplay",
    "#Telegram: https://t.me/cloudply",
    "",
    originalM3U.replace(/^#EXTM3U\s*/i, ""),
  ].join("\n");
}

// ---------------- GITHUB UPLOAD ----------------
async function uploadToGitHub(content, env) {
  const path = "jiotv_cf.m3u";

  const api =
    `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`;

  let sha;

  // Get existing file SHA
  const oldFile = await fetch(api, {
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "User-Agent": "Cloudflare-Worker",
    },
  });

  if (oldFile.ok) {
    try {
      const json = await oldFile.json();
      sha = json.sha;
    } catch {}
  }

  // Upload updated file
  const upload = await fetch(api, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "Cloudflare-Worker",
    },
    body: JSON.stringify({
      message: `Auto update JioTV playlist ${new Date().toISOString()}`,
      content: toBase64(content),
      sha,
    }),
  });

  const result = await upload.text();

  console.log("UPLOAD STATUS:", upload.status);
  console.log("UPLOAD RESPONSE:", result);

  if (!upload.ok) {
    throw new Error(
      `GitHub upload failed: ${upload.status}\n${result}`
    );
  }
}

// ---------------- MAIN ----------------
export async function runJioTV(env) {
  try {
    const m3u = await fetchM3U();
    await uploadToGitHub(m3u, env);

    return {
      success: true,
      message: "Playlist updated successfully",
    };
  } catch (error) {
    console.error(error);

    return {
      success: false,
      error: error.toString(),
    };
  }
}
