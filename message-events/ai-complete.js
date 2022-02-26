// api via rapidapi
const axios = require('axios').default;
require('dotenv').config();
const xRapidApiKey = process.env.rapidApiKey;
// require('./config.json');
const searchCommand = 'ai-complete';
module.exports = {
	name: 'ai-complete',
	async execute(message) {
		if (message.author.bot) return;
		const command = message.content.toLowerCase().split(' ');
		if (command.includes('image-api-info')) {
			await message.reply('100 / day: Hard Limit;  one request per second');
			return;
		}
		const searchIndex = command.findIndex(checkIndex);
		if (searchIndex != -1) {
			console.log(command);
			const searchQuery = [];
			for (let index = searchIndex + 1; index < command.length; index++) {
				// console.log(command[index]);
				searchQuery.push(command[index]);
			}
			let link = '';
			if (searchQuery != '') {
				console.log('search query: ' + searchQuery.join('+'));
				const options = {
					method: 'POST',
					url: 'https://waifu.p.rapidapi.com/path',
					params: {
						user_id: 'Rateeb Riyasat',
						message: searchQuery.join(' '),
						from_name: 'Rateeb',
						to_name: 'Girl',
						situation: 'Casual Conversation',
						translate_from: 'auto',
						translate_to: 'auto',
					},
					headers: {
						'content-type': 'application/json',
						'x-rapidapi-host': 'waifu.p.rapidapi.com',
						'x-rapidapi-key': xRapidApiKey,
					},
					data: {},
				};
				await axios.request(options)
					.then(function(response) {
						console.log('response: ');
						// console.log(response.data.value);
						if (response.status != 200) {
							console.log('bad response: ');
							console.log(response.status);
							return;
						}
						else {
							console.log(response.data);
							// console.log(link);
							// message.reply(link);
							console.log('message sent');
						}
					}).catch(function(error) {
						console.error(error);
					});
			}
		}
	},
};

function checkIndex(string) {
	return string == searchCommand;
}