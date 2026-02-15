import { REST, Routes } from 'discord.js';
import { Command } from './types/Command';
import { readCommands } from './utils/loader';
import dotenv from 'dotenv';
dotenv.config();
// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const rest = new REST({ version: '10' }).setToken(process.env.token!);

const updateCommands = async (commands: string[]): Promise<void> => {
	try {
		console.log('Started refreshing application (/) commands.');
		await rest.put(
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			Routes.applicationGuildCommands(process.env.clientId!, process.env.guildId!),
			{
				body: commands,
			},
		);

		console.log(
			`Successfully reloaded ${commands.length} application (/) commands.`,
		);
	}
	catch (error) {
		console.error(error);
	}
};

readCommands().then(async (commands) => {
	const deployCmds: string[] = commands.map((cmd: Command) => cmd.data.toJSON());
	await updateCommands(deployCmds);
});

