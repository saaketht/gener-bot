// api via rapidapi
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();
module.exports = {
	name: 'imagesearch',
	async execute(message: { author: { bot: any; }; content: string; reply: (arg0: string) => void; }) {
		if (message.author.bot) return;
		const command = message.content.toLowerCase().split(' ');
		if (command.includes('image-api-info')) {
			await message.reply('1000 / month: Hard Limit;  three requests per second');
			return;
		}
		if (command[0] == 'imagesearch') {
			console.log('operator: ' + command[0] + ' consecutive param?: ' + command[1]);
			console.log(command);
			const searchQuery = [];
			let offset = 1;
			let imgNum: any = 0;
			if ((!isNaN(Number(command[1]))) && (Number(command[1]) < 50)) {
				imgNum = command[1];
				offset = 2;
			}
			for (let index = offset; index < command.length; index++) {
				// console.log(command[index]);
				searchQuery.push(command[index]);
			}
			if (searchQuery.length > 0) {
				console.log('search query: ' + searchQuery.join('-'));
				const options: any = {
					method: 'GET',
					url: 'https://api.bing.microsoft.com/v7.0/images/search',
					params: {
						q: searchQuery.join(' '),
						count: '1',
						offset: imgNum,
						sort: 'relevance',
					},
					headers: {
						'Ocp-Apim-Subscription-Key': process.env.SEARCH_API_KEY,
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
							const url = response.data.value[0].contentUrl;
							console.log('Link: ' + url + ', image #: ' + imgNum);
							console.log('image link sent!');
							message.reply(url);
						}
					}).catch(function(error: any) {
						console.error(error);
					});
			}
		}
	},
};