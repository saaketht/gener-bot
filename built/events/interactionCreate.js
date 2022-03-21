"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const interactionCreateEvent = {
    name: 'interactionCreate',
    async execute(interaction) {
        if (!interaction.isCommand())
            return;
        const client = interaction.client;
        const command = client.commands.get(interaction.commandName);
        if (!command)
            return;
        const guild = interaction.guild;
        if (!guild)
            return;
        try {
            await command.execute(client, interaction);
        }
        catch (error) {
            console.error(`[${guild.id}]`, error);
            await interaction.reply({
                content: 'There was an error while executing this command!',
                ephemeral: true,
            });
        }
    },
};
exports.default = interactionCreateEvent;
// PRE-TYPESCRIPT CODE **DEPRECATED**
/* module.exports = {
    name: 'interactionCreate',
    execute(interaction) {
        console.log(`${interaction.user.tag} in #${interaction.channel.name} triggered an interaction. Interaction: ${interaction}`);
    },
}; */
// TYPESCRIPT FIRST ATTEMPT? **DEPRECATED**
/* export default (client: Client): void => {
    client.on('interactionCreate', async (interaction: Interaction) => {
        if (interaction.isCommand() || interaction.isContextMenu()) {
            await handleSlashCommand(client, interaction);
            console.log(`${interaction.user.tag} in #${interaction.channelId} triggered an interaction. Interaction: ${interaction.commandName}`);
        }
    })
}

const handleSlashCommand = async (client: Client, interaction: BaseCommandInteraction): Promise<void> => {
    // handle slash command here
}; */
