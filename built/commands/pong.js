"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const builders_1 = require("@discordjs/builders");
const embeds_1 = require("../embeds/embeds");
const pongCommand = {
    data: new builders_1.SlashCommandBuilder()
        .setName('pong')
        .setDescription('Replies with ping.'),
    async execute(client, interaction) {
        await interaction.reply({
            embeds: [
                (0, embeds_1.getPingEmbed)(),
            ],
        });
    },
};
exports.default = pongCommand;
