"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fetch_1 = __importDefault(require("node-fetch"));
const searchCommand = 'weather';
module.exports = {
    name: 'weather',
    async execute(message) {
        if (message.author.bot)
            return;
        const command = message.content.toLowerCase().split(' ');
        if (command[0] === searchCommand) {
            console.log('operator: ' + command[0] + ' consecutive param?: ' + command[1]);
            let city = 'orlando';
            if (command[1]) {
                city = command[1];
            }
            const res = await (0, node_fetch_1.default)('https://wttr.in/' + city + '?format=j1').then(response => response.json());
            const curr = res.current_condition[0];
            const near = res.nearest_area[0];
            // const weat = res.weather[0];
            console.log(near.areaName[0].value + ' feels like ' + curr.FeelsLikeF + '°F, and has ' + curr.visibilityMiles + ' miles of visibility with ' + curr.humidity + '% humidity. Recorded at ' + curr.localObsDateTime);
            message.reply(near.areaName[0].value + ' feels like ' + curr.FeelsLikeF + '°F, and has ' + curr.visibilityMiles + ' miles of visibility with ' + curr.humidity + '% humidity. Recorded at ' + curr.localObsDateTime);
        }
    },
};
