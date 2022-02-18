// api via rapidapi
const axios = require('axios').default;
const { xRapidApiKey } = process.env.rapidApiKey; // require('./config.json');
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
					method: 'GET',
					url: 'https://contextualwebsearch-websearch-v1.p.rapidapi.com/api/Search/ImageSearchAPI',
					params: { q: searchQuery.join(' '), pageNumber: '1', pageSize: '1', autoCorrect: 'true' },
					headers: {
						'x-rapidapi-host': 'contextualwebsearch-websearch-v1.p.rapidapi.com',
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
						link = response.data.value[0].url;
						console.log(link);
						message.reply(link);
						console.log('message sent');
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