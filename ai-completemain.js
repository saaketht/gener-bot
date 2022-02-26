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
			console.log (message.author.username);
			console.log(command);
			const searchQuery = [];
			for (let index = searchIndex + 1; index < command.length; index++) {
				// console.log(command[index]);
				searchQuery.push(command[index]);
			}
			// let link = '';
			if (searchQuery != '') {
				console.log('search query: ' + searchQuery.join('+'));
				const options = {
					method: 'GET',
					url: 'https://random-stuff-api.p.rapidapi.com/ai',
					params: {
						msg: searchQuery.join(' '),
						bot_name: 'Rateeb Riyasat',
						bot_gender: 'male',
						bot_master: 'generBot',
						bot_age: '20',
						bot_company: 'Almost Human',
						bot_location: 'University of Florida',
						bot_email: 'rateeb@gmail.com',
						bot_build: 'Public',
						bot_birth_year: '2002',
						bot_birth_date: '1st February, 2002',
						bot_birth_place: 'America',
						bot_favorite_color: 'Blue',
						bot_favorite_book: 'Harry Potter',
						bot_favorite_band: 'Imagine Dragons',
						bot_favorite_artist: 'Eminem',
						bot_favorite_actress: 'Emma Watson',
						bot_favorite_actor: 'Jim Carrey',
						id: message.author.username,
					},
					headers: {
						authorization: 'undefined',
						'x-rapidapi-host': 'random-stuff-api.p.rapidapi.com',
						'x-rapidapi-key': xRapidApiKey,
					},
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
							message.reply(response.data);
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