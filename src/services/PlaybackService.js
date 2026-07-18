// PlaybackService.js
// This service runs in a separate thread and handles remote control events
// from the lock screen / control center.
// 
// IMPORTANT: The actual chapter navigation logic lives in ReaderScreen.js via
// useTrackPlayerEvents(). This service only handles the basic play/pause state
// so the lock screen UI stays in sync. We do NOT call skipToNext/Previous here
// because we don't have a real queue - chapter navigation is handled by the app.

import TrackPlayer, { Event, State } from 'react-native-track-player';

module.exports = async function() {
    TrackPlayer.addEventListener(Event.RemotePlay, async () => {
        await TrackPlayer.play();
    });

    TrackPlayer.addEventListener(Event.RemotePause, async () => {
        await TrackPlayer.pause();
    });

    TrackPlayer.addEventListener(Event.RemoteStop, async () => {
        await TrackPlayer.pause();
    });

    // RemoteNext and RemotePrevious are handled by useTrackPlayerEvents in ReaderScreen.js
    // We register empty handlers here just to keep the lock screen buttons responsive
    TrackPlayer.addEventListener(Event.RemoteNext, async () => {
        // Handled by ReaderScreen via useTrackPlayerEvents
    });

    TrackPlayer.addEventListener(Event.RemotePrevious, async () => {
        // Handled by ReaderScreen via useTrackPlayerEvents
    });
};
