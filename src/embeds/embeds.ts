// Re-export all embeds from their respective files for backwards compatibility
// This allows existing imports from 'embeds/embeds' to continue working

export {
	getWarframeFishEmbed,
	getWarframeItemEmbed,
} from './warframe-embeds';

export {
	getAiResponseEmbed,
	getAiImageEmbed,
	getAiErrorEmbed,
} from './ai-embeds';

export type { AiResponseInfo } from './ai-embeds';

export {
	getPongEmbed,
	getServerEmbed,
	getUserEmbed,
	getAvatarEmbed,
} from './utility-embeds';
