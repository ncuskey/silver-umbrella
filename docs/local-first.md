# Local-First Grammar Stack

This project runs grammar analysis and LLM verification entirely on your own machine. Follow these steps to bring up LanguageTool and Llama (Ollama-compatible) locally.

## Prerequisites

- Docker Desktop or another container runtime.
- [Ollama](https://ollama.com/download) installed and running (`ollama serve`).
- Node.js >= 18.18.0 (for building the Next.js app).
- `docker-compose` (ships with Docker Desktop).

## LanguageTool Service

1. Start the bundled services from the repository root:
   ```bash
   docker compose up languagetool fixer
   ```
   - LanguageTool listens on `http://127.0.0.1:8010` (`LT_BASE_URL`).
   - The fixer service runs any additional normalization steps (punctuation, irregular verbs).

2. Verify the service:
   ```bash
   curl -s -X POST http://localhost:3000/api/languagetool/v1/check \
     -H 'content-type: application/json' \
     -d '{"text":"We was runned fast.","language":"en-US"}'
   ```
   You should receive a JSON response with LanguageTool matches. If the local container is down, the API will return `{ "matches": [] }` and the header `X-LT-Fallback: offline`.

## Local Llama Verifier

1. Pull the recommended model:
   ```bash
   ollama pull llama3.1:8b-instruct
   ```

2. The API expects an Ollama-compatible OpenAI server at `http://127.0.0.1:11434/v1` (`LLM_BASE_URL`). Ensure `ollama serve` is running.

3. Smoke test the verifier endpoint:
   ```bash
   curl -s -X POST http://localhost:3000/api/verifier \
     -H 'content-type: application/json' \
     -d '{"text":"We was runned fast.","mode":"quick"}'
   ```
   A healthy response contains a JSON verdict such as `{ "verdict": "revise", ... }`. If the verifier is offline or times out, you will see `{ "verdict": "unknown", "offline": true }`.

## Environment Variables

The Next.js app defaults to the local endpoints, but you can override them as needed:

- `LT_BASE_URL` – defaults to `http://127.0.0.1:8010`
- `LLM_BASE_URL` – defaults to `http://127.0.0.1:11434/v1`
- `LLM_MODEL` – defaults to `llama3.1:8b-instruct`
- `LLM_TIMEOUT_MS` – defaults to `20000`

Optional LanguageTool cloud key (not required for local mode):

- `LANGUAGETOOL_API_KEY`

## One-Liner Smoke Tests

After starting the dev server (`npm run dev`) you can run:

```bash
npm run smoke:lt   # LanguageTool proxy status code
npm run smoke:llm  # Llama verifier status code
```

Both commands print only the HTTP status code for quick health checks.
