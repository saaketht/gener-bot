import { CommandInteraction } from 'discord.js';
import { DiscordClient } from '.';
export interface Command {
  data: any;
  execute(
    client: DiscordClient,
    interaction: CommandInteraction
    ): Promise<void>;
}