import { Client, Collection } from 'discord.js';
import { Command, DatabaseRepository, DiscordEvent } from '.';
import { GameEngine } from '../game/GameEngine';
import { FlightTracker } from '../utils/flightTracker';
interface DiscordClient extends Client
{ commands: Collection<string, Command>;
  events: Collection<string, DiscordEvent>;
  messageEvents: Collection<string, MessageEvent>;
  db: DatabaseRepository;
  activeGames: Map<string, GameEngine>;
  flightTracker?: FlightTracker; }
