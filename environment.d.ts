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
        }
    }
}
export {};
