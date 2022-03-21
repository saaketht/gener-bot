"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const builders_1 = require("@discordjs/builders");
const embeds_1 = require("../embeds/embeds");
const pingCommand = {
    data: new builders_1.SlashCommandBuilder()
        .setName('ping')
        .setDescription('Replies with pong.'),
    async execute(client, interaction) {
        await interaction.reply({
            embeds: [
                (0, embeds_1.getPongEmbed)(),
            ],
        });
    },
};
exports.default = pingCommand;
// DEPRECATED VANILLA JAVASCRIPT CODE
/* module.exports = {
    data: new SlashCommandBuilder().setName('ping').setDescription('Replies with Pong!'),
    async execute(interaction) {
        await interaction.reply('Pong!');
    },
}; */ 
