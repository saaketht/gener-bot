require('dotenv').config();
const clientId = process.env.privilegedIds;
// require('../config.json');
const openAiApiKey = process.env.openAiKey;
// require('./config.json');
const { Configuration, OpenAIApi } = require('openai');
const searchCommand = 'ai-complete';
module.exports = {
	name: 'ai-complete',
	async execute(message) {
		if (message.author.bot) return;
		const command = message.content.toLowerCase().split(' ');
		// console.log(command);
		const searchIndex = command.findIndex(checkIndex);
		if (searchIndex != -1 && command.length > 1) {
			console.log (message.author.username);
			/* if (!clientId.includes(message.author.id)) {
				await message.reply('sorry! must be privileged user to return ai completion');
				console.log('unprivileged user access attempt');
				return;
			} */
			let maxTokens = 100;
			let modelName = 'curie';
			if (message.author.username.includes('gener')) {
				maxTokens = 1800;
				modelName = 'davinci'
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
			if (searchQuery != '') {
				console.log('search query: ' + searchQuery.join('+'));
				const response = await openai.createCompletion('text-' + modelName + '-001', {
					// prompt: 'generBot is a philosophical chatbot that is somewhat nihilistic and standoffish but responds well to loaded questions with depth and a hint of sarcasm:\n\n' + message.author.username + ' ' + searchQuery.join(' ') + '\ngenerBot:',
					// prompt: 'generBot is a bangladeshi male in college majoring in statistics named rateeb riyasat:\n\nYou: Where do you live\ngenerBot: 5300 kim court\nYou: Where do you go to college\ngenerBot: University of Florida\nYou: Where did you go to high school\ngenerBot: Suncoast High in Riviera Beach, Florida\nYou: What is your brother\'s name?\ngenerBot: Ayaan Rahman\nYou: ai-complete who is Ashfak Rahman\ngenerBot: my father\nYou: ' + searchQuery.join(' ') + '\ngenerBot:',
					// prompt: 'generBot is a theoretical physicist that is quite knowledgeable about physics but also well versed in other fields of science:\n\nYou: ' + searchQuery.join(' ') + '\ngenerBot:',
					// prompt: 'generBot is a chatbot that is extremely edgy and anti political correctness:\n\nYou: ' + searchQuery.join(' ') + '\ngenerBot:',
					temperature: 0.9,
					max_tokens: maxTokens,
					top_p: 0.3,
					frequency_penalty: 1.0,
					presence_penalty: 0.5,
				});
				console.log('RESPONSE TYPE: ' + typeof response.data.choices[0].text);
				const completion = response.data.choices[0].text;
				console.log(completion);
				message.reply(completion);
			}
		}

	},
};

function checkIndex(string) {
	return string == searchCommand || string == 'ai-cumplete';
}