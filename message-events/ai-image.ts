import { Message } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();
// const clientId = process.env.privilegedIds;
const activationStr = 'ai-image';
module.exports = {
	name: 'ai-image',
	async execute(message: Message) {
		if (message.author.bot) return;
		const command = message.content.toLowerCase().split(' ');
		// console.log(command);
		const searchIndex = command.findIndex(checkIndex);
		if (searchIndex != -1 && command.length > 1) {
			console.log (message.author.username + ' ran ' + activationStr + '!');	
			message.reply('this feature fr in the works rn');
		}
	},
};

function checkIndex(string: string) {
	return (string === activationStr || string === 'generimage');
}
