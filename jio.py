import json
import urllib.request
import urllib.error

def convert_url_to_m3u(json_url, output_m3u_path):
    print(f"Fetching JSON data from {json_url}...")
    
    try:
        # Fetch the JSON data
        req = urllib.request.Request(json_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response:
            data = response.read().decode('utf-8')
            channels = json.loads(data)
    except Exception as e:
        print(f"Error fetching data: {e}")
        return

    # Write to M3U file
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

            # 1. Base Channel Information
            m3u.write(f'#EXTINF:-1 tvg-id="{channel_id}" tvg-logo="{logo}" group-title="{category}",{name}\n')

            # Prepare Headers format (Header=Value&Header2=Value)
            headers = []
            if user_agent:
                headers.append(f"User-Agent={user_agent}")
            if referer:
                headers.append(f"Referer={referer}")
            header_string = '&'.join(headers)

            # 2. Add DRM specs for TiviMate
            if drm_key:
                m3u.write('#KODIPROP:inputstream.adaptive.license_type=clearkey\n')
                m3u.write(f'#KODIPROP:inputstream.adaptive.license_key={drm_key}\n')

            # 3. Add VLC Header options
            if user_agent:
                m3u.write(f'#EXTVLCOPT:http-user-agent={user_agent}\n')
            if referer:
                m3u.write(f'#EXTVLCOPT:http-referrer={referer}\n')

            # 4. Append headers to the Video stream directly
            final_mpd_url = mpd_url
            if header_string:
                final_mpd_url = f"{mpd_url}|{header_string}"

            # Write the final stream URL
            m3u.write(f'{final_mpd_url}\n\n')

    print(f"Success! Converted {len(channels)} channels. Saved as '{output_m3u_path}'.")

if __name__ == "__main__":
    json_source_url = "https://allinonereborn.online/jstrweb2/jstr.json"
    output_file = "playlist.m3u"
    
    convert_url_to_m3u(json_source_url, output_file)