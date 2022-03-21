"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const builders_1 = require("@discordjs/builders");
const embeds_1 = require("../embeds/embeds");
const avatarCommand = {
    data: new builders_1.SlashCommandBuilder()
        .setName('avatar')
        .setDescription('Get the avatar URL of the selected user, or your own avatar.')
        .addUserOption(option => option.setName('target').setDescription('The user\'s avatar to show')),
    async execute(client, interaction) {
        const user = interaction.options.getUser('target');
        if (user) {
            await interaction.reply({
                embeds: [
                    (0, embeds_1.getAvatarEmbed)(user),
                ],
            });
        }
    },
};
exports.default = avatarCommand;
