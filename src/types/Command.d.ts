import { AutocompleteInteraction, ChatInputCommandInteraction } from 'discord.js';
import { DiscordClient } from '.';
export interface Command {
  data: any;
  execute(
    client: DiscordClient,
    interaction: ChatInputCommandInteraction
    ): Promise<void>;
  autocomplete?(
    client: DiscordClient,
    interaction: AutocompleteInteraction
    ): Promise<void>;
}