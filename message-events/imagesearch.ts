// api via rapidapi
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();
const searchCommand = 'imagesearch';
module.exports = {
	name: 'imagesearch',
	async execute(message: { author: { bot: any; }; content: string; reply: (arg0: string) => void; }) {
		if (message.author.bot) return;
		const command = message.content.toLowerCase().split(' ');
		if (command.includes('image-api-info')) {
			await message.reply('1000 / month: Hard Limit;  three requests per second');
			return;
		}
		const searchIndex = command.findIndex(findIndex);
		if (searchIndex != -1) {
			console.log('operator: ' + command[searchIndex] + ' consecutive param?: ' + command[searchIndex + 1]);
			console.log(command);
			const searchQuery = [];
			let offset = 1;
			let imgNum: any = 0;
			if ((!isNaN(Number(command[searchIndex + 1]))) && (Number(command[searchIndex + 1]) < 19)) {
				imgNum = command[searchIndex + 1];
				offset = 2;
			}
			for (let index = searchIndex + offset; index < command.length; index++) {
				// console.log(command[index]);
				searchQuery.push(command[index]);
			}
			if (searchQuery.length > 0) {
				console.log('search query: ' + searchQuery.join('-'));
				const options: any = {
					method: 'GET',
					url: 'https://bing-image-search1.p.rapidapi.com/images/search',
					params: { q: searchQuery.join(' ') },
					headers: {
						'x-rapidapi-host': 'bing-image-search1.p.rapidapi.com',
						'x-rapidapi-key': process.env.rapidApiKey,
					},
				};
				await axios.request(options)
					.then(function(response: { status: number; data: { value: any[]; }; }) {
						console.log('response: ');
						// console.log(response.data.value);
						if (response.status != 200) {
							console.log('bad response: ');
							console.log(response.status);
							return;
						}
						else {
							const valueIndex = response.data.value[imgNum];
							const link = valueIndex.contentUrl;
							console.log('Link: ' + valueIndex.webSearchUrl + ', image #: ' + imgNum + ', Insights: ' + valueIndex.imageInsightsToken);
							message.reply(link);
							console.log('image link sent!');
						}
					}).catch(function(error: any) {
						console.error(error);
					});
			}
		}
	},
};

function findIndex(string: string | string[]) {
	return string.includes(searchCommand);
}
