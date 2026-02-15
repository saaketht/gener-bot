// const currencies = new Map('bruh', 'crazy', );
import { Message } from 'discord.js';
import { randomIntFromInterval } from '../../utils/helpers';
import fetch from 'node-fetch';
const foodCategories = ['burger', 'dessert', 'pasta', 'pizza'];
const indianFood = ['biryani', 'butter-chicken', 'dosa', 'idly', 'rice', 'samosa'];
const rolls = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣'];
const caps = ['🧢', '🎓', '🎩', '👒', '🪖', '⛑️'];
module.exports = {
	name: 'interruptions',
	async execute(message: Message) {
		if (message.author.bot) return;
		// if (message.author.username.includes('gener')) return;
		const spaces = message.content.toLowerCase().split(' ');
		const noSpaces = spaces.join('');
		if (noSpaces.includes('ping')) {
			console.log('ping');
			message.react('🏓');
		}
		else if (noSpaces.includes('daily')) {
			console.log('daily');
			message.reply('https://xkcd.com/');
		}
		else if (noSpaces.includes('random')) {
			console.log('random');
			const res = 'https://source.unsplash.com/random/300x200?sig=' + Math.random();
			message.reply(res);
			console.log('message sent, link: ' + res);
			return;
		}
		else if (spaces.includes('indian food')) {
			console.log(noSpaces.split(' '));
			message.reply(indianFood.join(', '));
		}
		else if (spaces.includes('food categories')) {
			console.log(noSpaces);
			message.reply(foodCategories.join(', '));
		}
		else if (spaces.includes('dog')) {
			console.log('dog');
			const res = await fetch('https://dog.ceo/api/breeds/image/random').then(response => response.json());
			console.log('dog api status: ' + res.status + ' dog link: ' + res.message);
			message.reply(res.message);
			console.log('dog sent');
		}
		else if (noSpaces.includes('cat')) {
			console.log('cat');
			const res = await fetch('https://aws.random.cat/meow').then(response => response.json());
			console.log(res.file);
			console.log('message sent');
			message.reply(res.file);
		}
		else if (noSpaces.includes('diceroll')) {
			console.log('dice roll');
			const res = randomIntFromInterval(1, rolls.length);
			message.react(rolls[res - 1]);
		}
		else if (spaces.includes('cap')) {
			console.log('cap');
			const res = randomIntFromInterval(1, caps.length);
			message.react(caps[res - 1]);
		}
	},
};