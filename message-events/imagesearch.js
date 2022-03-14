// api via rapidapi
require('dotenv').config();
const axios = require('axios').default;
const xRapidApiKey = process.env.rapidApiKey;
// require('./config.json');
const searchCommand = 'imagesearch';
module.exports = {
	name: 'imagesearch',
	async execute(message) {
		if (message.author.bot) return;
		const command = message.content.toLowerCase().split(' ');
		if (command.includes('image-api-info')) {
			await message.reply('1000 / month: Hard Limit;  three requests per second');
			return;
		}
		const searchIndex = command.findIndex(checkIndex);
		if (searchIndex != -1) {
			console.log('operator: ' + command[searchIndex] + ' consecutive param?: ' + command[searchIndex + 1]);
			console.log(command);
			const searchQuery = [];
			let offset = 1;
			let imgNum = 0
			if ( (!isNaN(command[searchIndex + 1])) && (command[searchIndex + 1] < 19) ){
				imgNum = command[searchIndex + 1];
				offset = 2;
			}
			for (let index = searchIndex + offset; index < command.length; index++) {
				// console.log(command[index]);
				searchQuery.push(command[index]);
			}
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
							const valueIndex = response.data.value[imgNum];
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
	return string.includes(searchCommand) || (string.includes('imagsearch') || string.includes('getimage'));
}
