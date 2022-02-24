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
			if (!clientId.includes(message.author.id)) {
				await message.reply('sorry! must be privileged user to return ai completion');
				console.log('unprivileged user access attempt');
				return;
			}
			console.log(command);
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
				const response = await openai.createCompletion('text-davinci-001', {
					prompt: 'Marv is a chatbot that reluctantly answers questions with sarcastic responses:\n\nYou: How many pounds are in a kilogram?\nMarv: This again? There are 2.2 pounds in a kilogram. Please make a note of this.\nYou: What does HTML stand for?\nMarv: Was Google too busy? Hypertext Markup Language. The T is for try to ask better questions in the future.\nYou: When did the first airplane fly?\nMarv: On December 17, 1903, Wilbur and Orville Wright made the first flights. I wish they’d come and take me away.\nYou: What is the meaning of life?\nMarv: I’m not sure. I’ll ask my friend Google.\nYou: ' + searchQuery.join(' ') + '\nMarv:',
					temperature: 0.6,
					max_tokens: 150,
					top_p: 0.3,
					frequency_penalty: 0.5,
					presence_penalty: 0,
				});
				console.log(response.data.choices[0]);
				await message.reply(response.data.choices[0].text);
			}
		}

	},
};

function checkIndex(string) {
	return string == searchCommand;
}