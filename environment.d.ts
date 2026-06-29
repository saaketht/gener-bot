declare global {
    namespace NodeJS {
        interface ProcessEnv {
            // Discord
            guildId: string;
            clientId: string;
            token: string;
            privilegedIds: string;
            // AI
            AI_SYSTEM_PROMPT: string;
            ANTHROPIC_API_KEY: string;
            // Set to 'true' to route financial/ticker queries to Grok instead of Claude
            // (e.g. when out of Claude credits). Claude calls that fail also fall back to Grok.
            CLAUDE_DISABLED?: string;
            GROK_API_KEY: string;
            FINNHUB_API_KEY: string;
            // APIs
            rapidApiKey: string;
            FLIGHTAWARE_API_KEY: string;
            BRAVE_SEARCH_API_KEY: string;
            UNSPLASH_ACCESS_KEY: string;
            // Database
            DB_NAME: string;
            MONGO_DB_USER: string;
            MONGO_DB_PASSWORD: string;
            // Prompts
            PROMPTS_DIR: string;
            // Runtime
            NODE_ENV: string;
            PORT: string;
            LOG_LEVEL: string;
            PNL_CSV_PATH: string;
            CASH_FLOW_JSONL_PATH: string;
        }
    }
}
export {};
