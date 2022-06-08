import { Configuration, OpenAIApi } from 'openai';
import { Message } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();
// const clientId = process.env.privilegedIds;
const openAiApiKey = process.env.openAiKey;
const activationStr = 'ai-complete';
module.exports = {
	name: 'ai-complete',
	async execute(message: Message) {
		if (message.author.bot) return;
		const command = message.content.toLowerCase().split(' ');
		// console.log(command);
		const searchIndex = command.findIndex(checkIndex);
		if (searchIndex != -1 && command.length > 1) {
			console.log (message.author.username + ' ran ' + activationStr + '!');
			/* if (!clientId.includes(message.author.id)) {
				await message.reply('sorry! must be privileged user to return ai completion');
				console.log('unprivileged user access attempt');
				return;
			} */
			let maxTokens = 100;
			let modelName = 'curie';
			if (message.author.username.includes('gener')) {
				maxTokens = 1800;
				modelName = 'davinci';
			}
			console.log('author: ' + message.author.username + ', command: ' + command);
			const configuration = new Configuration({
				apiKey: openAiApiKey,
			});
			const openai = new OpenAIApi(configuration);
			const searchQuery = [];
			for (let index = searchIndex + 1; index < command.length; index++) {
				// console.log(command[index]);
				searchQuery.push(command[index]);
			}
			if (searchQuery.length > 0) {
				console.log('search query: ' + searchQuery.join('+'));
				const response = await openai.createCompletion('text-' + modelName + '-001', {
					prompt: searchQuery.join(' '),
					temperature: 0,
					max_tokens: maxTokens,
					top_p: 1.0,
					frequency_penalty: 0.0,
					presence_penalty: 0.0,
				});
				const choice: any = response.data.choices;
				const choiceInfo: any = choice[0];
				const completion: any = choiceInfo.text;
				console.log(completion);
				message.reply(completion);
			}
		}

	},
};

function checkIndex(string: string) {
	return (string === activationStr || string === 'gener');
}
