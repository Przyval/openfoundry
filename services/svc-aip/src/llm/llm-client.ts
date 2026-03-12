// ---------------------------------------------------------------------------
// LLM client interface
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
}

export interface ChatOptions {
  /** Maximum number of tokens to generate. */
  maxTokens?: number;
  /** Sampling temperature (0-2). */
  temperature?: number;
  /** Stop sequences. */
  stop?: string[];
}

export interface ChatResponse {
  message: ChatMessage;
  usage: {
    promptTokens: number;
    completionTokens: number;
  };
  /** The model that actually served the request. */
  model?: string;
}

export interface LlmClient {
  /** Send a chat completion request. */
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;

  /** Generate embeddings for a list of texts. */
  embed(texts: string[]): Promise<number[][]>;
}
