import json
import urllib.request
import urllib.error
import argparse
import os

def convert_url_to_m3u(json_url, output_m3u_path):
    print("Fetching JSON data...")
    
    try:
        req = urllib.request.Request(json_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response:
            data = response.read().decode('utf-8')
            channels = json.loads(data)
    except Exception as e:
        print(f"Error fetching data: {e}")
        return

    with open(output_m3u_path, 'w', encoding='utf-8') as m3u:
        m3u.write("#EXTM3U\n")

        for channel in channels:
            channel_id = channel.get("channel_id", "")
            name = channel.get("name", "Unknown Channel")
            logo = channel.get("logo", "")
            category = channel.get("category", "Uncategorized")
            mpd_url = channel.get("mpd", "")
            drm_key = channel.get("drm", "")
            referer = channel.get("referer", "")
            user_agent = channel.get("userAgent", "")

            # 1. Base Channel Info
            m3u.write(f'#EXTINF:-1 tvg-id="{channel_id}" tvg-logo="{logo}" group-title="{category}",{name}\n')

            # 2. Add VLC Header options (Mainly for Shaka Player / VLC)
            if user_agent:
                m3u.write(f'#EXTVLCOPT:http-user-agent={user_agent}\n')
            if referer:
                m3u.write(f'#EXTVLCOPT:http-referrer={referer}\n')

            # 3. DRM Specs (Clean URL for Shaka Player compatibility)
            if drm_key:
                m3u.write('#KODIPROP:inputstream.adaptive.license_type=clearkey\n')
                m3u.write(f'#KODIPROP:inputstream.adaptive.license_key={drm_key}\n')

            # 4. Append headers to the Video stream directly (Mainly for TiviMate / ExoPlayer)
            headers = []
            if user_agent:
                headers.append(f"User-Agent={user_agent}")
            if referer:
                headers.append(f"Referer={referer}")
            header_string = '&'.join(headers)

            final_mpd_url = mpd_url
            if header_string:
                final_mpd_url = f"{mpd_url}|{header_string}"

            m3u.write(f'{final_mpd_url}\n\n')

    print(f"Success! Converted {len(channels)} channels. Saved as '{output_m3u_path}'.")

if __name__ == "__main__":
    # Setup the script to accept arguments from the terminal or GitHub Secrets
    parser = argparse.ArgumentParser(description="Convert an IPTV JSON URL to M3U.")
    parser.add_argument("--url", help="The secret JSON source URL", default=os.getenv("SECRET_JSON_URL"))
    args = parser.parse_args()

    # Stop the script if no URL is provided
    if not args.url:
        print("Error: You must provide a URL.")
        print("Usage: python convert_url.py --url https://your-secret-link.com/file.json")
        exit(1)

    output_file = "playlist.m3u"
    convert_url_to_m3u(args.url, output_file)
