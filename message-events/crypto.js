// api via rapidapi
const axios = require('axios').default;
require('dotenv').config();
const { xRapidApiKey } = process.env.rapidApiKey;
// require('./config.json');

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
	async execute(message) {
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
			const options = {
				method: 'GET',
				url: 'https://alpha-vantage.p.rapidapi.com/query',
				params: { to_currency: 'USD', function: 'CURRENCY_EXCHANGE_RATE', from_currency: currency.toUpperCase() },
				headers: {
					'x-rapidapi-host': 'alpha-vantage.p.rapidapi.com',
					'x-rapidapi-key': xRapidApiKey,
				},
			};
			await axios.request(options)
				.then(function(response) {
					console.log(response.data);
					if (response.status != 200) {
						console.log('bad response: ');
						console.log(response.status);
						return;
					}
					const thing = response.data['Realtime Currency Exchange Rate'];
					let exchangeRate = parseFloat(thing['5. Exchange Rate']);
					console.log(exchangeRate);
					if (exchangeRate > 1) {
						exchangeRate = exchangeRate.toFixed(2);
					}
					let fromName = thing['2. From_Currency Name'];
					if (thing['2. From_Currency Name'] == null) {
						fromName = thing['1. From_Currency Code'].toLowerCase();
					}
					message.reply('1 ' + fromName + ': (' + thing['1. From_Currency Code'] + ') is ' + exchangeRate + ' ' + thing['4. To_Currency Name'] + ': (' + thing['3. To_Currency Code'] + ')');
					console.log('message sent');
				}).catch(function(error) {
					console.error(error);
				});
		}

	},
};

function findAsset(string) {
	return currencies.has(string);
}