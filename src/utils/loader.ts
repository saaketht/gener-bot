import { Command, DiscordEvent, MessageEvent } from '../types';
import glob from 'glob';
import path from 'path';

const srcDir = path.join(process.cwd(), 'src');

const readCommands = async (): Promise<Command[]> => {
	const commands: Command[] = [];
	let res: string[];
	if (process.env.NODE_ENV === 'prod') {
		res = glob.sync('**/*.js', {
			cwd: `${process.cwd()}/built/src/commands/slash/`,
		});
	}
	else {
		res = glob.sync('**/*.ts', {
			cwd: `${srcDir}/commands/slash/`,
		});
	}

	for (const file of res) {
		const fileNoExt = file.substring(0, file.length - 3);

		const command: Command = (await import(`../commands/slash/${fileNoExt}`))
			.default as Command;
		commands.push(command);
	}
	return commands;
};

const readEvents = async (): Promise<DiscordEvent[]> => {
	const events: DiscordEvent[] = [];
	let res: string[];
	if (process.env.NODE_ENV === 'prod') {
		res = glob.sync('**/*.js', {
			cwd: `${process.cwd()}/built/src/events/`,
		});
	}
	else {
		res = glob.sync('**/*.ts', {
			cwd: `${srcDir}/events/`,
		});
	}
	for (const file of res) {
		const fileNoExt = file.substring(0, file.length - 3);

		const event: DiscordEvent = (await import(`../events/${fileNoExt}`))
			.default as DiscordEvent;
		events.push(event);
	}
	return events;
};

const readMessageEvents = async (): Promise<MessageEvent[]> => {
	const messageEvents: MessageEvent[] = [];
	let res: string[];
	if (process.env.NODE_ENV === 'prod') {
		res = glob.sync('**/*.js', {
			cwd: `${process.cwd()}/built/src/commands/message-events/`,
		});
	}
	else {
		res = glob.sync('**/*.ts', {
			cwd: `${srcDir}/commands/message-events/`,
		});
	}
	for (const file of res) {
		const fileNoExt = file.substring(0, file.length - 3);

		const messageEvent: MessageEvent = (await import(`../commands/message-events/${fileNoExt}`))
			.default as MessageEvent;
		messageEvents.push(messageEvent);
	}
	return messageEvents;
};

export { readCommands, readEvents, readMessageEvents };