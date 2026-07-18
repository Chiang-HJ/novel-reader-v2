import re

def main():
    file_path = r'C:\Users\user\.gemini\antigravity\scratch\novel-reader-v2\src\screens\ReaderScreen.js'
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 1. Remove import TrackPlayer...
    content = re.sub(r"import TrackPlayer.*?from 'react-native-track-player';\n?", "", content)
    
    # 2. Remove trackPlayerSetupRef
    content = re.sub(r"    const trackPlayerSetupRef = useRef\(false\);\n?", "", content)
    
    # 3. Remove useTrackPlayerEvents
    content = re.sub(r"    useTrackPlayerEvents\(\[.*?\}\);\n?", "", content, flags=re.DOTALL)
    
    # 4. Remove TrackPlayer calls in setPlayingState
    content = re.sub(r"        if \(trackPlayerSetupRef\.current\) \{\s*if \(state\) \{\s*TrackPlayer\.play\(\)\.catch\(\(\) => \{\}\);\s*\} else \{\s*TrackPlayer\.pause\(\)\.catch\(\(\) => \{\}\);\s*\}\s*\}\n?", "", content)

    # 5. Remove setupAudio trackPlayer setup
    content = re.sub(r"            if \(!trackPlayerSetupRef\.current\) \{\s*try \{\s*await TrackPlayer\.setupPlayer\(\);\s*await TrackPlayer\.updateOptions\(\{[^}]+\}\);\s*trackPlayerSetupRef\.current = true;\s*\} catch\(e\) \{\}\s*\}\n?", "", content)
    # The regex for setupAudio trackplayer needs to be a bit more robust since updateOptions has nested brackets.
    # We can just match until catch(e) {} }
    
    # Let's do it with more precise replacements.

if __name__ == '__main__':
    main()
