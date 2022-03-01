// api via rapidapi
const axios = require('axios').default;
require('dotenv').config();
const xRapidApiKey = process.env.rapidApiKey;
// require('./config.json');
// require('./config.json');
const searchCommand = 'imagesearch';
module.exports = {
	name: 'imagesearch',
	async execute(message) {
		if (message.author.bot) return;
		const command = message.content.toLowerCase().split(' ');
		if (command.includes('image-api-info')) {
			await message.reply('100 / day: Hard Limit;  one request per second');
			return;
		}
		const searchIndex = command.findIndex(checkIndex);
		let imgNum = 0;
		console.log(command);
		if (command[searchIndex].length > 10) {
			imgNum = command[searchIndex].split('')[11];
		}
		console.log('typing: ' + typeof command[searchIndex] + ' image number: ' + imgNum);
		if (searchIndex != -1) {
			const searchQuery = [];
			for (let index = searchIndex + 1; index < command.length; index++) {
				// console.log(command[index]);
				searchQuery.push(command[index]);
			}
			let link = '';
			if (searchQuery != '') {
				console.log('search query: ' + searchQuery.join('+'));
				const options = {
					method: 'GET',
					url: 'https://bing-image-search1.p.rapidapi.com/images/search',
					params: { q: searchQuery.join(' ') },
					headers: {
						'x-rapidapi-host': 'bing-image-search1.p.rapidapi.com',
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
							// const valueIndex = response.data.value[imgNum];
							link = valueIndex.contentUrl;
							console.log('Link: ' + valueIndex.webSearchUrl + ', Insights: ' + valueIndex.imageInsightsToken);
							message.reply(link);
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
	return string.includes(searchCommand);
}