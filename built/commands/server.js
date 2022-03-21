"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const builders_1 = require("@discordjs/builders");
const embeds_1 = require("../embeds/embeds");
const serverCommand = {
    data: new builders_1.SlashCommandBuilder()
        .setName('server')
        .setDescription('Replies with server info!'),
    async execute(client, interaction) {
        await interaction.reply({
            embeds: [
                (0, embeds_1.getServerEmbed)(interaction),
            ],
        });
    },
};
exports.default = serverCommand;
// DEPRECATED VANILLA JAVASCRIPT CODE
/*  module.exports = {
      data: new SlashCommandBuilder()
        .setName('server')
        .setDescription('Replies with server info!'),
    async execute(interaction) {
        await interaction.reply(`Server name: ${interaction.guild.name}\nTotal members: ${interaction.guild.memberCount}`);
    },
};  */
