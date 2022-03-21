"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const rest_1 = require("@discordjs/rest");
const v9_1 = require("discord-api-types/v9");
const utils_1 = require("./utils/utils");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const rest = new rest_1.REST({ version: '9' }).setToken(process.env.token);
const updateCommands = async (commands) => {
    try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(v9_1.Routes.applicationGuildCommands('939570010207158322', '439620237864992769'), {
            body: commands,
        });
        console.log(`Successfully reloaded ${commands.length} application (/) commands.`);
    }
    catch (error) {
        console.error(error);
    }
};
(0, utils_1.readCommands)().then(async (commands) => {
    const deployCmds = commands.map((cmd) => cmd.data.toJSON());
    await updateCommands(deployCmds);
});
