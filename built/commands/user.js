"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const builders_1 = require("@discordjs/builders");
const embeds_1 = require("../embeds/embeds");
const userCommand = {
    data: new builders_1.SlashCommandBuilder()
        .setName('user')
        .setDescription('Replies with user info!'),
    async execute(client, interaction) {
        await interaction.reply({
            embeds: [
                (0, embeds_1.getUserEmbed)(interaction),
            ],
        });
    },
};
exports.default = userCommand;
//  DEPRECATED VANILLA JAVASCRIPT CODE
/*  module.exports = {
    data: new SlashCommandBuilder()
        .setName('user')
        .setDescription('Replies with user info!'),
    async execute(interaction) {
        await interaction.reply(`Your tag: ${interaction.user.tag}\nYour id: ${interaction.user.id}`);
    },
};  */ 
