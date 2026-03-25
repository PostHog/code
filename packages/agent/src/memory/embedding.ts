import type { Logger } from "../utils/logger";

export interface Embedder {
  embed(text: string): Promise<Float32Array>;
  embedBatch(texts: string[]): Promise<Float32Array[]>;
}

export interface EmbedderOptions {
  model?: string;
  cacheDir?: string;
  logger?: Logger;
}

const DEFAULT_MODEL = "Xenova/all-MiniLM-L6-v2";

export async function createEmbedder(
  options: EmbedderOptions = {},
): Promise<Embedder> {
  const { pipeline } = await import("@huggingface/transformers");

  const model = options.model ?? DEFAULT_MODEL;
  options.logger?.debug("Loading embedding model", { model });

  const pipe = await pipeline("feature-extraction", model, {
    dtype: "fp32",
    ...(options.cacheDir ? { cache_dir: options.cacheDir } : {}),
  });

  options.logger?.debug("Embedding model loaded", { model });

  async function embed(text: string): Promise<Float32Array> {
    const output = await pipe(text, { pooling: "mean", normalize: true });
    return new Float32Array(output.data as Float64Array);
  }

  async function embedBatch(texts: string[]): Promise<Float32Array[]> {
    const results: Float32Array[] = [];
    for (const text of texts) {
      results.push(await embed(text));
    }
    return results;
  }

  return { embed, embedBatch };
}

export function createMockEmbedder(dimensions = 384): Embedder {
  function deterministicVector(text: string): Float32Array {
    const vec = new Float32Array(dimensions);
    for (let i = 0; i < dimensions; i++) {
      let hash = 0;
      for (let j = 0; j < text.length; j++) {
        hash = (hash * 31 + text.charCodeAt(j) + i) | 0;
      }
      vec[i] = (hash % 1000) / 1000;
    }

    let norm = 0;
    for (let i = 0; i < dimensions; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm);
    if (norm > 0) for (let i = 0; i < dimensions; i++) vec[i] /= norm;

    return vec;
  }

  return {
    embed: async (text: string) => deterministicVector(text),
    embedBatch: async (texts: string[]) => texts.map(deterministicVector),
  };
}
