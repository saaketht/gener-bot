"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.foodCategories = void 0;
// import fetch from 'node-fetch';
const axios_1 = __importDefault(require("axios"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const functions_1 = require("../functions/functions");
const foodCategories = ['biryani', 'burger', 'butter-chicken', 'dessert', 'dosa', 'idly', 'pasta', 'pizza', 'rice', 'samosa'];
exports.foodCategories = foodCategories;
module.exports = {
    name: 'food',
    async execute(message) {
        if (message.author.bot)
            return;
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
            const imgNum = (0, functions_1.randomIntFromInterval)(0, 15);
            console.log(command.split(' '));
            const options = {
                method: 'GET',
                url: 'https://bing-image-search1.p.rapidapi.com/images/search',
                params: { q: foodType },
                headers: {
                    'x-rapidapi-host': 'bing-image-search1.p.rapidapi.com',
                    'x-rapidapi-key': process.env.rapidApiKey,
                },
            };
            await axios_1.default.request(options)
                .then(function (response) {
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
            }).catch(function (error) {
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
