import requests

def generate_fancode_m3u():
    url = "https://fcapi.amitbala1993.workers.dev/"
    
    try:
        # Fetching data from the source URL
        response = requests.get(url)
        response.raise_for_status()
        data = response.json()
        
        m3u_content = "#EXTM3U\n"
        m3u_content += f"# Source: {url}\n\n"
        
        matches = data.get("matches", [])
        
        for match in matches:
            resolutions = match.get("all_resolutions", {})
            
            # Check for 1080p or 1080p5 streams
            stream_url = resolutions.get("1080p") or resolutions.get("1080p5")
            
            if stream_url:
                # Set Event and Channel Name
                event = match.get("tournament", "Unknown Event")
                channel_name = match.get("match") 
                
                # Fallback just in case "match" is null in the JSON
                if not channel_name:
                    channel_name = "Live Stream"
                
                # Format: Event | channel name
                display_title = f"{event} | {channel_name}"
                logo = match.get("image", "")
                
                # Add M3U lines with forced group-title
                m3u_content += f'#EXTINF:-1 tvg-logo="{logo}" group-title="Fancode",{display_title}\n'
                m3u_content += f"{stream_url}\n\n"
        
        # Save to file
        with open("fancode_1080p.m3u", "w", encoding="utf-8") as f:
            f.write(m3u_content)
            
        print("Successfully generated 'fancode_1080p.m3u'!")

    except requests.exceptions.RequestException as e:
        print(f"Network error occurred: {e}")
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    generate_fancode_m3u()