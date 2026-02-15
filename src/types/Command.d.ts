import { ChatInputCommandInteraction } from 'discord.js';
import { DiscordClient } from '.';
export interface Command {
  data: any;
  execute(
    client: DiscordClient,
    interaction: ChatInputCommandInteraction
    ): Promise<void>;
}