import axios from 'axios';
import { config } from '../config';

export interface GenerateOptions {
  prompt: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Send a prompt to Ollama and return the full response text.
 * Uses streaming=false for simplicity in the MVP.
 */
export async function generate(options: GenerateOptions): Promise<string> {
  const response = await axios.post(
    `${config.ollama.host}/api/generate`,
    {
      model: config.ollama.model,
      prompt: options.prompt,
      stream: false,
      options: {
        temperature: options.temperature ?? 0.3,
        num_predict: options.maxTokens ?? 512,
        num_ctx: 8192,
      },
    },
    { timeout: 300_000 }, // 5-minute timeout for CPU-only LLM
  );
  return response.data.response as string;
}
