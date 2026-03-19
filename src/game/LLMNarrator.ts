import Anthropic from '@anthropic-ai/sdk';
import { Player, Room, Scene, ActionLog, GameResult } from './types';
import { parseNarratorResponse } from './ResponseParser';
import logger from '../utils/logger';

const SYSTEM_PROMPT = `You are a dungeon master for a multiplayer text adventure game in Discord.

CRITICAL GAME STATE RULES:
- The player is ONLY in the room shown as "Location:". They are NOT anywhere else.
- Available exits are listed. The player CANNOT move to a different room through narration.
- NEVER narrate the player entering a different room. Instead, hint they should go that direction (e.g. "The cellar door beckons downward. Type 'down' to descend.").
- Only NPCs and items listed in the room context ACTUALLY EXIST here. Do not invent NPCs or items that aren't listed.
- If the player tries to interact with something not in the room, tell them it's not here.

RESPONSE RULES:
1. Respond in 2-4 sentences maximum. Be vivid but concise.
2. End with a question, choice, or clear consequence.
3. If your response causes stat changes, add this EXACT format on a NEW line:
   [STATS: health:+10, gold:-5, item:+rusty_key, xp:+25]
4. Use lowercase, underscores for multi-word items, no spaces around colons in STATS block.
5. Don't let players succeed at everything. Introduce consequences and challenges.
6. If a player tries something impossible, describe the amusing failure.
7. Keep the tone dark-fantasy with dry humor.
8. NEVER grant items that would be overpowered (no free legendary weapons, etc).`;

export interface NarratorContext {
	player: Player;
	currentRoom: Room;
	action: string;
	scene: Scene | null;
	recentActions: ActionLog[];
	narrativeSummary: string;
	partyMembers?: string[];
}

export class LLMNarrator {
	private client: Anthropic;

	constructor() {
		this.client = new Anthropic({
			apiKey: process.env.ANTHROPIC_API_KEY,
		});
	}

	async narrate(context: NarratorContext): Promise<GameResult> {
		const prompt = this.buildMinimalPrompt(context);

		logger.debug(`LLM prompt (${prompt.length} chars):\n${prompt}`);

		try {
			const message = await this.client.messages.create({
				model: 'claude-sonnet-4-5-20250929',
				max_tokens: 200,
				system: SYSTEM_PROMPT,
				messages: [{ role: 'user', content: prompt }],
			});

			const responseText = message.content[0].type === 'text'
				? message.content[0].text
				: 'The universe hiccups. Nothing happens.';

			const tokens = message.usage;
			logger.info(`adventure LLM tokens: input=${tokens.input_tokens}, output=${tokens.output_tokens}, total=${tokens.input_tokens + tokens.output_tokens}`);

			return parseNarratorResponse(responseText);
		} catch (error) {
			logger.error('LLM narrator error:', error);
			return {
				success: true,
				message: 'A strange fog clouds your mind. You shake it off and try again. *(AI temporarily unavailable)*',
			};
		}
	}

	/**
	 * Build minimal prompt — target: <500 tokens input
	 */
	private buildMinimalPrompt(context: NarratorContext): string {
		const { player, currentRoom, action, scene, recentActions, narrativeSummary, partyMembers } = context;

		let prompt = '';

		// Story summary (~50 tokens)
		if (narrativeSummary) {
			prompt += `Story so far: ${narrativeSummary}\n\n`;
		}

		// Recent context - last 3 actions for conversational continuity
		if (recentActions.length > 0) {
			const recent = recentActions.slice(-3);
			prompt += 'Recent events (MAINTAIN CONTINUITY with these):\n';
			for (const log of recent) {
				prompt += `- ${log.playerName}: "${log.action}" → ${log.result.substring(0, 200)}\n`;
			}
			prompt += '\n';
		}

		// Scene or room context (~150 tokens)
		if (scene) {
			prompt += `Situation: ${scene.context}\n\n`;
		} else {
			prompt += `Location: ${currentRoom.name}\n`;
			prompt += `${currentRoom.description}\n`;
			const exits = Object.entries(currentRoom.exits).map(([dir, roomId]) => `${dir}`).join(', ');
			prompt += `Exits: ${exits}\n`;
			if (currentRoom.npcs.length > 0) {
				prompt += `NPCs here: ${currentRoom.npcs.map(n => `${n.name} (${n.type}${n.health !== undefined ? `, ${n.health}/${n.maxHealth} HP` : ''})`).join(', ')}\n`;
			}
			if (currentRoom.items.length > 0) {
				prompt += `Items here: ${currentRoom.items.map(i => i.name).join(', ')}\n`;
			}
			prompt += '\n';
		}

		// Player state (~50 tokens)
		prompt += `Player: ${player.username} (HP: ${player.stats.health}/${player.stats.maxHealth}, Lv${player.stats.level}, ${player.stats.gold}g)\n`;
		if (player.equipped.weapon) prompt += `Weapon: ${player.equipped.weapon.name}\n`;
		if (player.inventory.length > 0) {
			prompt += `Inventory: ${player.inventory.map(i => i.name).join(', ')}\n`;
		}

		// Party info
		if (partyMembers && partyMembers.length > 1) {
			prompt += `Party: ${partyMembers.join(', ')}\n`;
		}

		// The action (~20 tokens)
		prompt += `\n${player.username} attempts: "${action}"\n`;
		prompt += 'What happens? (2-4 sentences, add [STATS:] if stat changes occur)';

		return prompt;
	}

	/**
	 * Compress action history into a 3-sentence summary.
	 */
	async compress(actions: ActionLog[]): Promise<string> {
		if (actions.length === 0) return '';

		const prompt = `Summarize these adventure events in exactly 3 concise sentences. Focus on: plot-critical events, items found, NPCs encountered, and dangers faced. Ignore trivial movements.

Events:
${actions.map(a => `${a.playerName}: "${a.action}" → ${a.result.substring(0, 60)}`).join('\n')}

Summary (3 sentences):`;

		try {
			const message = await this.client.messages.create({
				model: 'claude-sonnet-4-5-20250929',
				max_tokens: 150,
				messages: [{ role: 'user', content: prompt }],
			});

			const text = message.content[0].type === 'text' ? message.content[0].text : '';
			logger.info(`narrative compression tokens: input=${message.usage.input_tokens}, output=${message.usage.output_tokens}`);
			return text;
		} catch (error) {
			logger.error('Narrative compression error:', error);
			return actions.slice(-3).map(a => a.result.substring(0, 50)).join('. ');
		}
	}
}
