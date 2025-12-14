# WebLLM Available Models

## Tiny (< 1B params) - Fast, limited reasoning

| Model | ID |
|-------|-----|
| SmolLM2 135M | `SmolLM2-135M-Instruct-q0f16-MLC` |
| SmolLM2 360M | `SmolLM2-360M-Instruct-q4f16_1-MLC` |
| Qwen2.5 0.5B | `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` |
| Qwen3 0.6B | `Qwen3-0.6B-q4f16_1-MLC` |

## Small (1-2B params) - Good balance

| Model | ID |
|-------|-----|
| Llama 3.2 1B | `Llama-3.2-1B-Instruct-q4f16_1-MLC` |
| TinyLlama 1.1B | `TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC` |
| Qwen2.5 1.5B | `Qwen2.5-1.5B-Instruct-q4f16_1-MLC` |
| Qwen3 1.7B | `Qwen3-1.7B-q4f16_1-MLC` |
| SmolLM2 1.7B | `SmolLM2-1.7B-Instruct-q4f16_1-MLC` |
| StableLM 1.6B | `stablelm-2-zephyr-1_6b-q4f16_1-MLC` |
| Gemma 2B | `gemma-2-2b-it-q4f16_1-MLC` |

## Medium (3-4B params) - Better reasoning

| Model | ID |
|-------|-----|
| Llama 3.2 3B | `Llama-3.2-3B-Instruct-q4f16_1-MLC` |
| Qwen2.5 3B | `Qwen2.5-3B-Instruct-q4f16_1-MLC` |
| Qwen3 4B | `Qwen3-4B-q4f16_1-MLC` |
| Hermes 3 Llama 3B | `Hermes-3-Llama-3.2-3B-q4f16_1-MLC` |
| Phi 3.5 Mini | `Phi-3.5-mini-instruct-q4f16_1-MLC` |
| RedPajama 3B | `RedPajama-INCITE-Chat-3B-v1-q4f16_1-MLC` |

## Large (7-9B params) - Best reasoning, needs VRAM

| Model | ID |
|-------|-----|
| Llama 3.1 8B | `Llama-3.1-8B-Instruct-q4f16_1-MLC` |
| Qwen2.5 7B | `Qwen2.5-7B-Instruct-q4f16_1-MLC` |
| Qwen3 8B | `Qwen3-8B-q4f16_1-MLC` |
| Mistral 7B | `Mistral-7B-Instruct-v0.3-q4f16_1-MLC` |
| Gemma 2 9B | `gemma-2-9b-it-q4f16_1-MLC` |
| DeepSeek R1 7B | `DeepSeek-R1-Distill-Qwen-7B-q4f16_1-MLC` |

## Quantization Notes

- `q4f16_1` - 4-bit quantized, float16 compute (good balance)
- `q4f32_1` - 4-bit quantized, float32 compute (slower, slightly better)
- `q0f16` - No quantization, float16 (larger, best quality)
- `-1k` suffix - 1K context window variant (faster, less memory)

## Source

Full list: https://github.com/mlc-ai/web-llm/blob/main/src/config.ts
