import { NativeModules } from 'react-native';

const hasTrackPlayer = !!(NativeModules && NativeModules.TrackPlayerModule);

let TrackPlayer = {
    setupPlayer: async () => {},
    updateOptions: async () => {},
    reset: async () => {},
    add: async () => {},
    pause: async () => {},
    play: async () => {},
    stop: async () => {},
    registerPlaybackService: () => {},
    addEventListener: () => ({ remove: () => {} }),
};

let Capability = {
    Play: 1,
    Pause: 2,
    Stop: 3,
    SkipToNext: 4,
    SkipToPrevious: 5,
};

let State = {
    None: 0,
    Ready: 1,
    Playing: 2,
    Paused: 3,
    Stopped: 4,
};

let Event = {
    RemotePlay: 'remote-play',
    RemotePause: 'remote-pause',
    RemoteStop: 'remote-stop',
    RemoteNext: 'remote-next',
    RemotePrevious: 'remote-previous',
};

let useTrackPlayerEvents = () => {};

if (hasTrackPlayer) {
    try {
        const TP = require('react-native-track-player');
        TrackPlayer = TP.default || TP;
        if (TP.Capability) Capability = TP.Capability;
        if (TP.State) State = TP.State;
        if (TP.Event) Event = TP.Event;
        if (TP.useTrackPlayerEvents) useTrackPlayerEvents = TP.useTrackPlayerEvents;
    } catch (e) {}
}

export default TrackPlayer;
export { Capability, State, Event, useTrackPlayerEvents, hasTrackPlayer };
