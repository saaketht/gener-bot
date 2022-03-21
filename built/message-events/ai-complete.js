"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const openai_1 = require("openai");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
// const clientId = process.env.privilegedIds;
const openAiApiKey = process.env.openAiKey;
const activationStr = 'ai-complete';
module.exports = {
    name: 'ai-complete',
    async execute(message) {
        if (message.author.bot)
            return;
        const command = message.content.toLowerCase().split(' ');
        // console.log(command);
        const searchIndex = command.findIndex(checkIndex);
        if (searchIndex != -1 && command.length > 1) {
            console.log(message.author.username + ' ran ' + activationStr + '!');
            /* if (!clientId.includes(message.author.id)) {
                await message.reply('sorry! must be privileged user to return ai completion');
                console.log('unprivileged user access attempt');
                return;
            } */
            let maxTokens = 100;
            let modelName = 'curie';
            if (message.author.username.includes('gener')) {
                maxTokens = 1800;
                modelName = 'davinci';
            }
            console.log('author: ' + message.author.username + ', command: ' + command);
            const configuration = new openai_1.Configuration({
                apiKey: openAiApiKey,
            });
            const openai = new openai_1.OpenAIApi(configuration);
            const searchQuery = [];
            for (let index = searchIndex + 1; index < command.length; index++) {
                // console.log(command[index]);
                searchQuery.push(command[index]);
            }
            if (searchQuery.length > 0) {
                console.log('search query: ' + searchQuery.join('+'));
                const response = await openai.createCompletion('text-' + modelName + '-001', {
                    prompt: 'generBot is a chatbot that always answers:\n\nYou: ' + searchQuery.join(' ') + '\ngenerBot:',
                    temperature: 0.9,
                    max_tokens: maxTokens,
                    top_p: 0.3,
                    frequency_penalty: 1.5,
                    presence_penalty: 1.0,
                });
                const choice = response.data.choices;
                const choiceInfo = choice[0];
                console.log('RESPONSE : ' + choiceInfo);
                const completion = choiceInfo.text;
                console.log(completion);
                message.reply(completion);
            }
        }
    },
};
function checkIndex(string) {
    return string == activationStr;
}