const fs = require('fs');
let code = fs.readFileSync('src/screens/ReaderScreen.js', 'utf8');

const target = `    const updateLockScreenMeta = async (n, title) => {
        try {
            await TrackPlayer.setupPlayer();
            await TrackPlayer.updateOptions({
                stopWithApp: false,
                alwaysPauseOnInterruption: false,
                capabilities: [
                    Capability.Play,
                    Capability.Pause,
                    Capability.Stop,
                ],
                compactCapabilities: [Capability.Play, Capability.Pause],
            });
            await TrackPlayer.reset();
            await TrackPlayer.add({
                id: '1',
                url: 'http://', 
                title: title,
                artist: n.title,
                artwork: n.coverUrl || undefined
            });
        } catch (e) {
            console.log('TrackPlayer setup failed', e);
        }
    };`;

const replacement = `    // Initialize TrackPlayer once
    useEffect(() => {
        const initTP = async () => {
            try {
                await TrackPlayer.setupPlayer();
                await TrackPlayer.updateOptions({
                    stopWithApp: false,
                    alwaysPauseOnInterruption: false,
                    capabilities: [
                        Capability.Play,
                        Capability.Pause,
                        Capability.Stop,
                        Capability.SkipToNext,
                        Capability.SkipToPrevious
                    ],
                    compactCapabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext, Capability.SkipToPrevious],
                });
            } catch (e) {} // Ignore if already initialized
        };
        initTP();
    }, []);

    const updateLockScreenMeta = async (n, title) => {
        try {
            await TrackPlayer.reset();
            await TrackPlayer.add({
                id: '1',
                url: 'http://', // dummy url required by TrackPlayer
                title: title,
                artist: n.title,
                artwork: n.coverUrl || undefined
            });
            // If it was playing, keep it in the playing state visually
            if (isPlayingRef.current) {
                await TrackPlayer.play();
            }
        } catch (e) {
            console.log('TrackPlayer metadata update failed', e);
        }
    };`;

code = code.replace(target, replacement);
fs.writeFileSync('src/screens/ReaderScreen.js', code, 'utf8');
