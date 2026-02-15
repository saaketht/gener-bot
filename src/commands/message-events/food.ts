// import fetch from 'node-fetch';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();
import { Message } from 'discord.js';
import { randomIntFromInterval } from '../../utils/helpers';

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
				foodType = 'butter chicken';
			}
		});
		if (foodType != '') {
			const imgNum = randomIntFromInterval(0, 50);
			console.log(command.split(' '));
			const options: any = {
				method: 'GET',
				url: 'https://api.bing.microsoft.com/v7.0/images/search',
				params: {
					q: foodType,
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
	},
};

export { foodCategories };
