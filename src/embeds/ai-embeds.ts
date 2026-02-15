import { EmbedBuilder, User } from 'discord.js';

// AI response info interface
interface AiResponseInfo {
	model: string;
	prompt: string;
	response: string;
	inputTokens: number;
	outputTokens: number;
	success: boolean;
}

// embed for Claude AI responses
const getAiResponseEmbed = (user: User, info: AiResponseInfo): EmbedBuilder => {
	// Truncate prompt if too long for field
	const promptDisplay = info.prompt.length > 200
		? info.prompt.substring(0, 200) + '...'
		: info.prompt;

	// Truncate response if too long for description (leaving room for formatting)
	const responseDisplay = info.response.length > 1800
		? info.response.substring(0, 1800) + '...'
		: info.response;

	const embed = new EmbedBuilder()
		.setColor(info.success ? '#10B981' : '#EF4444')
		.setAuthor({
			name: user.username,
			iconURL: user.displayAvatarURL(),
		})
		.addFields({ name: 'Prompt', value: promptDisplay, inline: false })
		.setDescription(responseDisplay)
		.setFooter({
			text: `${info.model} | ${info.inputTokens} in / ${info.outputTokens} out tokens`,
		})
		.setTimestamp();

	return embed;
};

// embed for AI image generation
const getAiImageEmbed = (user: User, prompt: string, imageUrl: string): EmbedBuilder => {
	const promptDisplay = prompt.length > 200
		? prompt.substring(0, 200) + '...'
		: prompt;

	return new EmbedBuilder()
		.setColor('#8B5CF6')
		.setAuthor({
			name: user.username,
			iconURL: user.displayAvatarURL(),
		})
		.addFields({ name: 'Prompt', value: promptDisplay, inline: false })
		.setImage(imageUrl)
		.setFooter({ text: 'DALL-E 3' })
		.setTimestamp();
};

// embed for AI error responses
const getAiErrorEmbed = (user: User, errorMessage: string): EmbedBuilder => {
	return new EmbedBuilder()
		.setColor('#EF4444')
		.setAuthor({
			name: user.username,
			iconURL: user.displayAvatarURL(),
		})
		.setTitle('AI Error')
		.setDescription(errorMessage)
		.setTimestamp();
};

export {
	getAiResponseEmbed,
	getAiImageEmbed,
	getAiErrorEmbed,
};

export type { AiResponseInfo };
