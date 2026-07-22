import { OpenAIAdapter } from './openai.js';
import { AnthropicAdapter } from './anthropic.js';
import { GeminiAdapter } from './gemini.js';
import { OpenRouterAdapter } from './openrouter.js';
import { LocalAdapter } from './local.js';

export function createAdapters() {
  const adapters = {
    openai: new OpenAIAdapter(),
    anthropic: new AnthropicAdapter(),
    gemini: new GeminiAdapter(),
    openrouter: new OpenRouterAdapter(),
  };

  if (process.env.OLLAMA_BASE_URL) {
    adapters.ollama = new LocalAdapter('Ollama', process.env.OLLAMA_BASE_URL);
  }
  if (process.env.LM_STUDIO_BASE_URL) {
    adapters.lmstudio = new LocalAdapter('LM Studio', process.env.LM_STUDIO_BASE_URL);
  }

  return adapters;
}
