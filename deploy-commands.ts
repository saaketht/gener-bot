import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v9';
import { Command } from './@types/bot/Command';
import { readCommands } from './utils/utils';
import dotenv from 'dotenv';
dotenv.config();
// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const rest = new REST({ version: '9' }).setToken(process.env.token!);

const updateCommands = async (commands: string[]): Promise<void> => {
	try {
		console.log('Started refreshing application (/) commands.');
		await rest.put(
			Routes.applicationGuildCommands(
				'939570010207158322',
				'439620237864992769',
			),
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

