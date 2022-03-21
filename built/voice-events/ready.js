"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const voice_1 = require("@discordjs/voice");
const player = (0, voice_1.createAudioPlayer)();
function playSong() {
    /**
     * We specify an arbitrary inputType. This means that we aren't too sure what the format of
     * the input is, and that we'd like to have this converted into a format we can use. If we
     * were using an Ogg or WebM source, then we could change this value. However, for now we
     * will leave this as arbitrary.
     */
    const resource = (0, voice_1.createAudioResource)('https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', {
        inputType: voice_1.StreamType.Arbitrary,
    });
    /**
     * We will now play this to the audio player. By default, the audio player will not play until
     * at least one voice connection is subscribed to it, so it is fine to attach our resource to the
     * audio player this early.
     */
    player.play(resource);
    /**
     * Here we are using a helper function. It will resolve if the player enters the Playing
     * state within 5 seconds, otherwise it will reject with an error.
     */
    return (0, voice_1.entersState)(player, voice_1.AudioPlayerStatus.Playing, 5e3);
}
module.exports = {
    name: 'ready',
    async execute() {
        try {
            await playSong();
            console.log('Song is ready to play!');
        }
        catch (error) {
            console.error(error);
        }
    },
};
