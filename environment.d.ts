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
        AWS_REGION: string;
        S3_BUCKET_NAME: string;
      }
    }
}
export {};