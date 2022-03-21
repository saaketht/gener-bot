"use strict";
const { joinVoiceChannel, createAudioPlayer, createAudioResource, entersState, StreamType, AudioPlayerStatus, VoiceConnectionStatus, } = require('@discordjs/voice');
const { createDiscordJSAdapter } = require('./adapter.ts');
const { player } = require('ready.js');
async function connectToChannel(channel) {
    /**
     * Here, we try to establish a connection to a voice channel. If we're already connected
     * to this voice channel, @discordjs/voice will just return the existing connection for us!
     */
    const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: createDiscordJSAdapter(channel),
    });
    /**
     * If we're dealing with a connection that isn't yet Ready, we can set a reasonable
     * time limit before giving up. In this example, we give the voice connection 30 seconds
     * to enter the ready state before giving up.
     */
    try {
        /**
         * Allow ourselves 30 seconds to join the voice channel. If we do not join within then,
         * an error is thrown.
         */
        await entersState(connection, VoiceConnectionStatus.Ready, 30e3);
        /**
         * At this point, the voice connection is ready within 30 seconds! This means we can
         * start playing audio in the voice channel. We return the connection so it can be
         * used by the caller.
         */
        return connection;
    }
    catch (error) {
        /**
         * At this point, the voice connection has not entered the Ready state. We should make
         * sure to destroy it, and propagate the error by throwing it, so that the calling function
         * is aware that we failed to connect to the channel.
         */
        connection.destroy();
        throw error;
    }
}
module.exports = {
    name: 'messageCreate',
    async execute(message) {
        if (message.author.bot)
            return;
        const command = message.content.toLowerCase().split(' ');
        if (message.content === '-join') {
            const channel = message.member?.voice.channel;
            console.log(typeof channel);
            if (channel) {
                /**
                 * The user is in a voice channel, try to connect.
                 */
                try {
                    const connection = await connectToChannel(channel);
                    /**
                     * We have successfully connected! Now we can subscribe our connection to
                     * the player. This means that the player will play audio in the user's
                     * voice channel.
                     */
                    connection.subscribe(player);
                    await message.reply('Playing now!');
                }
                catch (error) {
                    /**
                     * Unable to connect to the voice channel within 30 seconds :(
                     */
                    console.error(error);
                }
            }
            else {
                /**
                 * The user is not in a voice channel.
                 */
                void message.reply('Join a voice channel then try again!');
            }
        }
    },
};
