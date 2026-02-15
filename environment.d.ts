declare global {
    namespace NodeJS {
        interface ProcessEnv {
            // Discord
            guildId: string;
            clientId: string;
            token: string;
            privilegedIds: string;
            // AI
            ANTHROPIC_API_KEY: string;
            AI_SYSTEM_PROMPT: string;
            openAiKey: string;
            // APIs
            rapidApiKey: string;
            SEARCH_API_KEY: string;
            // Database
            DB_NAME: string;
            MONGO_DB_USER: string;
            MONGO_DB_PASSWORD: string;
            // Runtime
            NODE_ENV: string;
            PORT: string;
            LOG_LEVEL: string;
        }
    }
}
export {};
