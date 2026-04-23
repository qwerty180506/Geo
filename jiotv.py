import json
import os
import urllib.request
from urllib.parse import urlparse

def clean_url(url):
    """Converts '...index.mpd|cookie=__hdnea__' to '...index.mpd?__hdnea__'"""
    if '|cookie=' in url:
        base, cookie_value = url.split('|cookie=', 1)
        return f"{base}?{cookie_value}"
    return url

def extract_name_from_url(url):
    """Extracts, cleans, and formats the channel name from the stream URL."""
    def clean_name(raw_name):
        name = raw_name.replace("_MOB", "").replace("_", " ")
        if name.endswith(" MOB"):
            name = name[:-4]
        return name.strip()

    try:
        path = urlparse(url).path
        parts = [p for p in path.split('/') if p] 
        
        if 'WDVLive' in parts:
            idx = parts.index('WDVLive')
            if idx > 0:
                return clean_name(parts[idx - 1])
                
        if 'bpk-tv' in parts:
            idx = parts.index('bpk-tv')
            if idx + 1 < len(parts):
                return clean_name(parts[idx + 1])
                
        if len(parts) >= 2:
            return clean_name(parts[-2])
            
    except Exception:
        pass
        
    return "Unknown Channel"

def generate_m3u_from_url(jio_url, meta_file, output_file):
    print(f"Fetching stream data from {jio_url}...")
    try:
        req = urllib.request.Request(jio_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response:
            if response.status != 200:
                print(f"Error fetching URL: HTTP Status {response.status}")
                return
            raw_data = response.read().decode('utf-8')
            jio_data = json.loads(raw_data)
    except Exception as e:
        print(f"Error fetching or parsing the URL data: {e}")
        return

    if not os.path.exists(meta_file):
        print(f"Error: Make sure {meta_file} is in the same directory.")
        return
        
    with open(meta_file, 'r', encoding='utf-8') as f:
        try:
            meta_data = json.load(f)
        except json.JSONDecodeError:
            print(f"Error parsing {meta_file}. Ensure it is valid JSON.")
            return
            
    meta_dict = {str(item.get("tvg-id")): item for item in meta_data}
    
    with open(output_file, 'w', encoding='utf-8') as out:
        out.write("#EXTM3U\n")
        
        for channel_id, stream_info in jio_data.items():
            raw_url = stream_info.get("url", "")
            
            if not raw_url:
                continue

            url = clean_url(raw_url)  # <-- Clean the URL here
                
            meta_info = meta_dict.get(str(channel_id), {})
            
            if not meta_info:
                name = extract_name_from_url(url)
                logo = ""
                group = "Unknown"
            else:
                name = meta_info.get("name")
                if not name:
                    name = extract_name_from_url(url)
                    
                logo = meta_info.get("logo", "")
                group = meta_info.get("group", "Unknown")
                
            extinf = f'#EXTINF:-1 tvg-id="{channel_id}" tvg-logo="{logo}" group-title="{group}",{name}\n'
            
            drm_props = (
                '#KODIPROP:inputstream=inputstream.adaptive\n'
                '#KODIPROP:inputstream.adaptive.manifest_type=mpd\n'
                '#KODIPROP:inputstream.adaptive.license_type=clearkey\n'
                f'#KODIPROP:inputstream.adaptive.license_key=https://temp.webplay.fun/jtv/key.php?id={channel_id}\n'
            )
            
            out.write(extinf)
            out.write(drm_props)
            out.write(url + "\n\n")
            
    print(f"Success! M3U playlist generated as '{output_file}'.")

if __name__ == "__main__":
    JIO_URL = "https://raw.githubusercontent.com/Anasvirat18/Jio_/refs/heads/main/stream.json"
    META_FILENAME = "meta.txt"
    OUTPUT_FILENAME = "jiotv.m3u"
    
    generate_m3u_from_url(JIO_URL, META_FILENAME, OUTPUT_FILENAME)
