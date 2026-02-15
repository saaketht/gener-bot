import fetch from 'node-fetch';
import { Message } from 'discord.js';

const searchCommand = 'weather';
module.exports = {
	name: 'weather',
	async execute(message: Message) {
		if (message.author.bot) return;
		const command = message.content.toLowerCase().split(' ');
		if (command[0] === searchCommand) {
			console.log('operator: ' + command[0] + ' consecutive param?: ' + command[1]);
			let city = 'west palm beach';
			if (command[1]) {
				city = command[1];
			}
			const res = await fetch('https://wttr.in/' + city + '?format=j1').then(response => response.json());
			const curr = res.current_condition[0];
			const near = res.nearest_area[0];
			// const weat = res.weather[0];
			console.log(near.areaName[0].value + ' feels like ' + curr.FeelsLikeF + '°F, and has ' + curr.visibilityMiles + ' miles of visibility with ' + curr.humidity + '% humidity. Recorded at ' + curr.localObsDateTime);
			message.reply(near.areaName[0].value + ' feels like ' + curr.FeelsLikeF + '°F, and has ' + curr.visibilityMiles + ' miles of visibility with ' + curr.humidity + '% humidity. Recorded at ' + curr.localObsDateTime);
		}
	},
};
