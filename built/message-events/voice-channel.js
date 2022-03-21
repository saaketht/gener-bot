"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require('dotenv').config();
const voiceCommand = 'voice';
let currentVC = '';
module.exports = {
    name: 'voice-channel',
    async execute(message) {
        if (message.author.bot)
            return;
        const command = message.content.toLowerCase().split(' ');
        // const searchIndex = command.findIndex(checkIndex);
        if (!message.guild)
            return;
        if (message.content === '-jjjjjoin') {
            const channel = message.member?.voice.channel;
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
function checkIndex(string) {
    return string.includes(voiceCommand);
}
