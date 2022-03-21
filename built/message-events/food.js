"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.foodCategories = void 0;
const node_fetch_1 = __importDefault(require("node-fetch"));
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
            console.log(command.split(' '));
            const { image } = await (0, node_fetch_1.default)(`https://foodish-api.herokuapp.com/api/images/${foodType}`)
                .then(response => response.json());
            const link = image;
            message.reply(link);
            console.log('message sent: ' + link);
            return;
        }
    },
};
