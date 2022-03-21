"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// api via rapidapi
const axios_1 = __importDefault(require("axios"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
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
        if (message.author.bot)
            return;
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
                    'x-rapidapi-key': process.env.rapidApiKey,
                },
            };
            await axios_1.default.request(options)
                .then(function (response) {
                console.log(response.data);
                if (response.status != 200) {
                    console.log('bad response: ');
                    console.log(response.status);
                    return;
                }
                const thing = response.data['Realtime Currency Exchange Rate'];
                const exchangeRate = parseFloat(thing['5. Exchange Rate']);
                let parsedRate;
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
            }).catch(function (error) {
                console.error(error);
            });
        }
    },
};
function findAsset(string) {
    return currencies.has(string);
}
