"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const guildCreateEvent = {
    name: 'guildCreate',
    async execute(guild) {
        console.log(`Joined a new guild: ${guild.name} - ${guild.id}`);
    },
};
exports.default = guildCreateEvent;
