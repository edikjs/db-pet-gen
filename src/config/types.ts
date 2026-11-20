export type ChatProvider = 'openrouter' | 'opencode' | 'groq';

export interface ChatModelConfig {
  provider: ChatProvider;
  model: string;
  baseUrl: string;
  temperature: number;
  jsonMode: boolean;
  apiKey?: string;
  maxTokens?: number;
  maxRetries?: number;
  maxConcurrency?: number;
}

export interface AppConfig {
  chat: ChatModelConfig;
  runsDir: string;
  observability: {
    provider: 'none' | 'phoenix';
    endpoint: string;
    projectName: string;
  };
}
