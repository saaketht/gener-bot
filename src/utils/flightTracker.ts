import { ActionRowBuilder, ButtonBuilder, ButtonStyle, TextChannel } from 'discord.js';
import { DiscordClient } from '../types';
import { TrackedFlights } from '../models/dbObjects';
import { fetchFlightStatus } from './flightApi';
import { getFlightTrackingEmbed } from '../embeds/flight-embeds';
import logger from './logger';
import { Op } from 'sequelize';

const MINUTE = 60_000;

export class FlightTracker {
	private intervals: Map<number, NodeJS.Timeout> = new Map();
	private client: DiscordClient;
	private cleanupInterval: NodeJS.Timeout | null = null;

	constructor(client: DiscordClient) {
		this.client = client;

		// hourly cleanup of expired flights
		this.cleanupInterval = setInterval(() => this.cleanupExpired(), 60 * MINUTE);
	}

	async resumeAll(): Promise<void> {
		await TrackedFlights.sync();

		const active = await TrackedFlights.findAll({
			where: {
				active: true,
				expires_at: { [Op.gt]: new Date() },
			},
		});

		for (const flight of active) {
			await this.startTracking((flight as any).id);
		}

		if (active.length > 0) {
			logger.info(`Resumed tracking ${active.length} flight(s)`);
		}
	}

	async startTracking(dbRowId: number): Promise<void> {
		// don't double-track
		if (this.intervals.has(dbRowId)) return;

		// do an initial poll immediately
		await this.pollAndUpdate(dbRowId);

		// schedule future polls if still active
		const row = await TrackedFlights.findByPk(dbRowId) as any;
		if (!row || !row.active) return;

		const interval = this.getPollingInterval(row.status, row.flight_date, row.last_api_data);
		const timer = setInterval(() => this.pollAndUpdate(dbRowId), interval);
		this.intervals.set(dbRowId, timer);
	}

	stopTracking(dbRowId: number): void {
		const timer = this.intervals.get(dbRowId);
		if (timer) {
			clearInterval(timer);
			this.intervals.delete(dbRowId);
		}
	}

	async pollAndUpdate(dbRowId: number): Promise<void> {
		try {
			const row = await TrackedFlights.findByPk(dbRowId) as any;
			if (!row || !row.active) {
				this.stopTracking(dbRowId);
				return;
			}

			const data = await fetchFlightStatus(row.flight_number, row.flight_date);
			if (!data) {
				logger.warn(`Poll: ${row.flight_number} (row=${dbRowId}) — API returned null, skipping cycle`);
				return;
			}

			// build embed and button
			const embed = getFlightTrackingEmbed(data);
			const refreshButton = new ButtonBuilder()
				.setCustomId(`flight_refresh_${dbRowId}`)
				.setLabel('Refresh')
				.setStyle(ButtonStyle.Secondary)
				.setEmoji('🔄');
			const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(refreshButton);

			// send or edit message
			const channel = await this.client.channels.fetch(row.channel_id).catch(() => null) as TextChannel | null;
			if (!channel) {
				logger.warn(`Channel ${row.channel_id} not found, deactivating flight ${dbRowId}`);
				await row.update({ active: false });
				this.stopTracking(dbRowId);
				return;
			}

			if (row.message_id) {
				try {
					const msg = await channel.messages.fetch(row.message_id);
					await msg.edit({ embeds: [embed], components: [actionRow] });
				}
				catch {
					// message deleted — send a new one
					const newMsg = await channel.send({ embeds: [embed], components: [actionRow] });
					await row.update({ message_id: newMsg.id });
				}
			}
			else {
				const newMsg = await channel.send({ embeds: [embed], components: [actionRow] });
				await row.update({ message_id: newMsg.id });
			}

			// map API status to our simplified status
			const newStatus = mapStatus(data.status);
			const oldStatus = row.status;

			// update DB
			await row.update({
				status: newStatus,
				last_api_data: JSON.stringify(data),
			});

			if (newStatus !== oldStatus) {
				logger.info(`Poll: ${row.flight_number} (row=${dbRowId}) status ${oldStatus} → ${newStatus}`);
			}

			// if flight is done, deactivate
			if (newStatus === 'landed' || newStatus === 'cancelled') {
				logger.info(`Poll: ${row.flight_number} (row=${dbRowId}) finished (${newStatus}), deactivating`);
				await row.update({ active: false });
				this.stopTracking(dbRowId);
				return;
			}

			// recalculate polling interval
			const newInterval = this.getPollingInterval(newStatus, row.flight_date, JSON.stringify(data));
			const currentTimer = this.intervals.get(dbRowId);
			if (currentTimer) {
				clearInterval(currentTimer);
				const timer = setInterval(() => this.pollAndUpdate(dbRowId), newInterval);
				this.intervals.set(dbRowId, timer);
			}
		}
		catch (error) {
			logger.error(`Poll: error for row=${dbRowId}`, { error });
		}
	}

	private getPollingInterval(status: string, _flightDate: string, lastApiData?: string): number {
		// parse UTC departure/arrival times from cached data if available
		if (lastApiData) {
			try {
				const data = JSON.parse(lastApiData);
				const depUtc = data.departure?.actualTimeUtc ?? data.departure?.scheduledTimeUtc;
				const arrUtc = data.arrival?.estimatedTimeUtc ?? data.arrival?.scheduledTimeUtc;
				const depTime = depUtc ? new Date(depUtc.replace(' ', 'T')).getTime() : NaN;
				const arrTime = arrUtc ? new Date(arrUtc.replace(' ', 'T')).getTime() : NaN;
				const now = Date.now();

				if (!isNaN(depTime) && !isNaN(arrTime)) {
					// within 30 min of arrival
					if (now > depTime && (arrTime - now) < 30 * MINUTE) return 2 * MINUTE;
					// en route
					if (now > depTime) return 3 * MINUTE;
					// less than 2h to departure
					if ((depTime - now) < 120 * MINUTE) return 5 * MINUTE;
				}
			}
			catch {
				// fallthrough to default interval
			}
		}

		if (status === 'active' || status === 'enroute') return 3 * MINUTE;
		return 15 * MINUTE;
	}

	private async cleanupExpired(): Promise<void> {
		try {
			const expired = await TrackedFlights.findAll({
				where: {
					active: true,
					expires_at: { [Op.lt]: new Date() },
				},
			});

			for (const flight of expired) {
				const id = (flight as any).id;
				await (flight as any).update({ active: false });
				this.stopTracking(id);
			}

			if (expired.length > 0) {
				logger.info(`Cleaned up ${expired.length} expired flight(s)`);
			}
		}
		catch (error) {
			logger.error('Error cleaning up expired flights', { error });
		}
	}

	destroy(): void {
		for (const [id] of this.intervals) {
			this.stopTracking(id);
		}
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
		}
	}
}

function mapStatus(apiStatus: string): string {
	const s = apiStatus.toLowerCase();
	if (s.includes('land') || s.includes('arrived')) return 'landed';
	if (s.includes('cancel')) return 'cancelled';
	if (s.includes('en route') || s.includes('enroute') || s.includes('departed') || s.includes('airborne')) return 'active';
	if (s.includes('boarding')) return 'boarding';
	return 'scheduled';
}
