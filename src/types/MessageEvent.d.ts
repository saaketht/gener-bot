import { Message } from 'discord.js';
export interface MessageEvent {
  name: string;
  execute(
    message: Message,
    ): Promise<void>;
}