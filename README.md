# Strava Analytics Tool

AI-powered natural-language insights over your Strava activity data, running locally against an Ollama model.

## Stack

- **Server** — Node.js + Express, MongoDB (Mongoose), LangGraph agent over `@langchain/ollama`
- **Client** — Vue 3 (CDN) single page, vanilla CSS
- **LLM** — local Ollama (default `llama3.1`)
- **Data** — Strava API v3 with cached activity fetches and OAuth refresh-token flow

## How it works

The server exposes a `/analyze` endpoint that runs your query through a LangGraph state machine. The graph calls the LLM with tools bound, routes to a tool node when the model requests one (currently `get_recent_run_activity`), feeds the result back, and returns a short summary. Each result is persisted to MongoDB and listed in the UI.

## Setup

Requires Node 18+, MongoDB, Ollama, and a Strava API app.

```bash
cd server
npm install
```

Create `server/.env`:

```
STRAVA_CLIENT_ID=...
STRAVA_CLIENT_SECRET=...
STRAVA_ACCESS_TOKEN=...
STRAVA_REFRESH_TOKEN=...
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=llama3.1
PORT=8080
```

Pull the model and start everything:

```bash
ollama pull llama3.1
npm start                  # from server/
open client/index.html     # or serve client/ however you like
```

## API

- `POST /analyze` — `{ query: string }` → runs the agent, persists, returns the insight
- `GET /insights` — list past insights, newest first
- `GET /insights/:id` — fetch one

## Units

All distances are reported in miles, elevation in feet. The system prompt and tool formatters both enforce this — Strava's metric values are converted server-side.
