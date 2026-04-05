import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { Command } from '../../types';
import { WatchedTickers } from '../../models/dbObjects';

const DEFAULT_TICKERS = [
	{ symbol: 'BTC', name: 'Bitcoin', type: 'crypto' },
	{ symbol: 'ETH', name: 'Ethereum', type: 'crypto' },
	{ symbol: 'BNB', name: 'BNB', type: 'crypto' },
	{ symbol: 'XRP', name: 'XRP', type: 'crypto' },
	{ symbol: 'ADA', name: 'Cardano', type: 'crypto' },
	{ symbol: 'SOL', name: 'Solana', type: 'crypto' },
	{ symbol: 'XMR', name: 'Monero', type: 'crypto' },
	{ symbol: 'HNT', name: 'Helium', type: 'crypto' },
	{ symbol: 'LTC', name: 'Litecoin', type: 'crypto' },
	{ symbol: 'DOGE', name: 'Dogecoin', type: 'crypto' },
	{ symbol: 'SPY', name: 'S&P 500 ETF', type: 'etf' },
	{ symbol: 'QQQ', name: 'Nasdaq 100 ETF', type: 'etf' },
	{ symbol: 'GLD', name: 'Gold ETF', type: 'etf' },
	{ symbol: 'SLV', name: 'Silver ETF', type: 'etf' },
	{ symbol: 'WTI', name: 'Crude Oil (WTI)', type: 'commodity' },
	{ symbol: 'BRENT', name: 'Brent Crude', type: 'commodity' },
	{ symbol: 'NATURAL_GAS', name: 'Natural Gas', type: 'commodity' },
];

async function ensureDefaults(guildId: string, userId: string) {
	const count = await WatchedTickers.count({ where: { guild_id: guildId } });
	if (count > 0) return;

	await WatchedTickers.bulkCreate(
		DEFAULT_TICKERS.map(t => ({
			symbol: t.symbol,
			name: t.name,
			type: t.type,
			added_by: userId,
			guild_id: guildId,
		})),
	);
}

const tickerCommand: Command = {
	data: new SlashCommandBuilder()
		.setName('ticker')
		.setDescription('Manage tracked financial instruments')
		.addSubcommand(sub =>
			sub.setName('add')
				.setDescription('Add a ticker to the watchlist')
				.addStringOption(opt =>
					opt.setName('symbol')
						.setDescription('Ticker symbol (e.g. AAPL, BTC, NVDA)')
						.setRequired(true))
				.addStringOption(opt =>
					opt.setName('name')
						.setDescription('Friendly name (e.g. Apple Inc.)')
						.setRequired(false))
				.addStringOption(opt =>
					opt.setName('type')
						.setDescription('Instrument type')
						.setRequired(false)
						.addChoices(
							{ name: 'Stock', value: 'stock' },
							{ name: 'Crypto', value: 'crypto' },
							{ name: 'ETF', value: 'etf' },
							{ name: 'Commodity', value: 'commodity' },
						)),
		)
		.addSubcommand(sub =>
			sub.setName('remove')
				.setDescription('Remove a ticker from the watchlist')
				.addStringOption(opt =>
					opt.setName('symbol')
						.setDescription('Ticker symbol to remove')
						.setRequired(true)),
		)
		.addSubcommand(sub =>
			sub.setName('list')
				.setDescription('View all tracked tickers'),
		) as SlashCommandBuilder,

	async execute(_client, interaction: ChatInputCommandInteraction) {
		const sub = interaction.options.getSubcommand();
		const guildId = interaction.guildId!;

		await ensureDefaults(guildId, interaction.user.id);

		if (sub === 'add') await handleAdd(interaction, guildId);
		else if (sub === 'remove') await handleRemove(interaction, guildId);
		else if (sub === 'list') await handleList(interaction, guildId);
	},
};

async function handleAdd(interaction: ChatInputCommandInteraction, guildId: string) {
	const symbol = interaction.options.getString('symbol', true).toUpperCase().trim();
	const name = interaction.options.getString('name') ?? null;
	const type = interaction.options.getString('type') ?? 'stock';

	const existing = await WatchedTickers.findOne({
		where: {
			symbol,
			guild_id: guildId,
		},
	});

	if (existing) {
		await interaction.reply(`**${symbol}** is already on the watchlist.`);
		return;
	}

	await WatchedTickers.create({
		symbol,
		name,
		type,
		added_by: interaction.user.id,
		guild_id: guildId,
	});

	await interaction.reply(`added **${symbol}**${name ? ` (${name})` : ''} as ${type}.`);
}

async function handleRemove(interaction: ChatInputCommandInteraction, guildId: string) {
	const symbol = interaction.options.getString('symbol', true).toUpperCase().trim();

	const deleted = await WatchedTickers.destroy({
		where: {
			symbol,
			guild_id: guildId,
		},
	});

	if (deleted === 0) {
		await interaction.reply(`**${symbol}** is not on the watchlist.`);
		return;
	}

	await interaction.reply(`removed **${symbol}** from the watchlist.`);
}

async function handleList(interaction: ChatInputCommandInteraction, guildId: string) {
	const tickers: any[] = await WatchedTickers.findAll({
		where: { guild_id: guildId },
		order: [['type', 'ASC'], ['symbol', 'ASC']],
	});

	if (tickers.length === 0) {
		await interaction.reply('no tickers on the watchlist. use `/ticker add` to add some.');
		return;
	}

	const grouped = new Map<string, string[]>();
	for (const t of tickers) {
		const type = t.type;
		if (!grouped.has(type)) grouped.set(type, []);
		grouped.get(type)!.push(t.name ? `${t.symbol} (${t.name})` : t.symbol);
	}

	const lines: string[] = [];
	for (const [type, symbols] of grouped) {
		lines.push(`**${type}**: ${symbols.join(', ')}`);
	}

	const embed = new EmbedBuilder()
		.setTitle('Tracked Tickers')
		.setDescription(lines.join('\n'))
		.setColor(0x2b2d31)
		.setFooter({ text: `${tickers.length} instruments` });

	await interaction.reply({ embeds: [embed] });
}

export default tickerCommand;
