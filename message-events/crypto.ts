// api via rapidapi
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();


const currencies = new Map();
currencies.set('bitcoin', 'btc');
currencies.set('ethereum', 'eth');
currencies.set('bnb', 'bnb');
currencies.set('xrp', 'xrp');
currencies.set('cardano', 'ada');
currencies.set('solana', 'sol');
currencies.set('monero', 'xmr');
currencies.set('helium', 'hnt');
currencies.set('litecoin', 'ltc');
currencies.set('safemoon', 'SAFEMOON');
currencies.set('dogecoin', 'doge');
module.exports = {
	name: 'crypto',
	async execute(message: { author: { bot: any; }; content: string; reply: (arg0: string) => void; }) {
		if (message.author.bot) return;
		const command = message.content.toLowerCase().split(' ');
		const assetIndex = command.findIndex(findAsset);
		if (command.includes('crypto-api-info')) {
			console.log('500 / day: Hard Limit; 5 requests per minute');
			await message.reply('500 / day: Hard Limit; 5 requests per minute');
			return;
		}
		if (assetIndex != -1) {
			const currencyCode = currencies.get(command[assetIndex]);
			console.log(command[assetIndex] + ', ' + currencyCode);
			const currency = currencies.get(command[assetIndex]);
			const options: any = {
				method: 'GET',
				url: 'https://alpha-vantage.p.rapidapi.com/query',
				params: { to_currency: 'USD', function: 'CURRENCY_EXCHANGE_RATE', from_currency: currency.toUpperCase() },
				headers: {
					'x-rapidapi-host': 'alpha-vantage.p.rapidapi.com',
					'x-rapidapi-key': process.env.rapidApiKey,
				},
			};
			await axios.request(options)
				.then(function(response: { data: { [x: string]: any; }; status: number; }) {
					console.log(response.data);
					if (response.status != 200) {
						console.log('bad response: ');
						console.log(response.status);
						return;
					}
					const thing = response.data['Realtime Currency Exchange Rate'];
					const exchangeRate = parseFloat(thing['5. Exchange Rate']);
					let parsedRate: string;
					console.log(exchangeRate);
					if (exchangeRate > 1) {
						parsedRate = exchangeRate.toFixed(2);
					}
					else {
						parsedRate = exchangeRate.toFixed(3);
					}
					let fromName = thing['2. From_Currency Name'];
					if (thing['2. From_Currency Name'] == null) {
						fromName = thing['1. From_Currency Code'].toLowerCase();
					}
					message.reply('1 ' + fromName + ': (' + thing['1. From_Currency Code'] + ') is ' + parsedRate + ' ' + thing['4. To_Currency Name'] + ': (' + thing['3. To_Currency Code'] + ')');
					console.log('message sent');
				}).catch(function(error: any) {
					console.error(error);
				});
		}

	},
};

function findAsset(string: any) {
	return currencies.has(string);
}