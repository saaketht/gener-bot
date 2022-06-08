// import fetch from 'node-fetch';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();
import { Message } from 'discord.js';
import { randomIntFromInterval } from '../functions/functions';

const foodCategories = ['biryani', 'burger', 'butter-chicken', 'dessert', 'dosa', 'idly', 'pasta', 'pizza', 'rice', 'samosa'];
module.exports = {
	name: 'food',
	async execute(message: Message) {
		if (message.author.bot) return;
		const command = message.content.split(' ').join('').toLowerCase();
		let foodType = '';
		foodCategories.forEach(i => {
			if (command.includes(i)) {
				foodType = i;
			}
			else if (command.includes('butterchicken')) {
				foodType = 'butter-chicken';
			}
		});
		if (foodType != '') {
			const imgNum = randomIntFromInterval(0, 15);
			console.log(command.split(' '));
			const options: any = {
				method: 'GET',
				url: 'https://bing-image-search1.p.rapidapi.com/images/search',
				params: { q: foodType },
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
			/* const { image } = await fetch(`https://foodish-api.herokuapp.com/api/images/${foodType}`)
				.then(response => response.json());
			const link = image;
			message.reply(link);
			console.log('message sent: ' + link);
			return; */
		}
	},
};

export { foodCategories };
