declare global {
    namespace NodeJS {
      interface ProcessEnv {
        guildId: string;
        clientId: string;
        token: string;
        privilegedIds: string;
        rapidApiKey: string;
        openAiKey: string;
        DB_NAME: string;
        MONGO_DB_USER: string;
        MONGO_DB_PASSWORD: string;
      }
    }
}
export {};