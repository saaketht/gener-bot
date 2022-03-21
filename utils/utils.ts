import { Command, DiscordEvent, MessageEvent } from '../@types/bot';
import * as glob from 'glob';

const readCommands = async (): Promise<Command[]> => {
	const commands: Command[] = [];
	let res: string[];
	if (process.env.NODE_ENV === 'prod') {
		res = glob.sync('**/*.js', {
			cwd: `${process.cwd()}/commands/`,
		});
	}
	else {
		res = res = glob.sync('**/*.ts', {
			cwd: `${process.cwd()}/commands/`,
		});
	}

	for (const file of res) {
		const fileNoExt = file.substring(0, file.length - 3);

		const command: Command = (await import(`../commands/${fileNoExt}`))
			.default as Command;
		// Set a new item in the Collection
		commands.push(command);
	}
	return commands;
};

const readEvents = async (): Promise<DiscordEvent[]> => {
	const events: DiscordEvent[] = [];
	let res: string[];
	if (process.env.NODE_ENV === 'prod') {
		res = glob.sync('**/*.js', {
			cwd: `${process.cwd()}/events/`,
		});
	}
	else {
		res = res = glob.sync('**/*.ts', {
			cwd: `${process.cwd()}/events/`,
		});
	}
	for (const file of res) {
		const fileNoExt = file.substring(0, file.length - 3);

		const event: DiscordEvent = (await import(`../events/${fileNoExt}`))
			.default as DiscordEvent;
		// Set a new item in the Collection
		events.push(event);
	}
	return events;
};

const readMessageEvents = async (): Promise<MessageEvent[]> => {
	const messageEvents: MessageEvent[] = [];
	let res: string[];
	if (process.env.NODE_ENV === 'prod') {
		res = glob.sync('**/*.js', {
			cwd: `${process.cwd()}/message-events/`,
		});
	}
	else {
		res = res = glob.sync('**/*.ts', {
			cwd: `${process.cwd()}/message-events/`,
		});
	}
	for (const file of res) {
		const fileNoExt = file.substring(0, file.length - 3);

		const messageEvent: MessageEvent = (await import(`../message-events/${fileNoExt}`))
			.default as MessageEvent;
		messageEvents.push(messageEvent);
	}
	return messageEvents;
};

export { readCommands, readEvents, readMessageEvents };