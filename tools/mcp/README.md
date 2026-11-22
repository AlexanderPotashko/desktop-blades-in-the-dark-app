# blades-sheet MCP server (code mode)

Lets an AI agent (Claude Desktop, Claude Code or any MCP client) read and edit the character sheet open in the browser.

**Code mode:** instead of many small tools, the agent gets two:

| Tool | What it does |
|---|---|
| `sheet_api` | returns a TypeScript description of the sheet and helpers, plus a summary of the open sheet |
| `sheet_execute` | runs the agent's JavaScript against the live sheet; changes are saved back (`save: false` = dry run); returns `{ result, logs, changed, saved }` |

```
AI client ──stdio── server.mjs ──WebSocket 127.0.0.1:8765── charsheet.html (browser)
```

## Setup

1. `cd tools/mcp && npm install` (Node 18+).
2. Register the server in your AI client (use the absolute path):
   - **Claude Code:** `claude mcp add blades-sheet -- node /path/to/tools/mcp/server.mjs`
   - **Claude Desktop:** in `claude_desktop_config.json`
     ```json
     { "mcpServers": { "blades-sheet": { "command": "node", "args": ["/path/to/tools/mcp/server.mjs"] } } }
     ```
3. Open `charsheet.html`, go to ⚙ → «ИИ-агент (MCP)» and tick the checkbox. The header shows **ИИ ●** when connected.

Ask the agent things like "add a room «Подвал» to the plan of «Дом Резо»" or "what is my Craft rating and stress?".

## Options (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `BLADES_PORT` | `8765` | WebSocket port; set the same port in ⚙ |
| `BLADES_TOKEN` | — | if set, the sheet must send the same token (⚙ → токен) |

## Safety

- The WebSocket listens on `127.0.0.1` only and refuses web origins (only `file://` pages connect).
- The sheet makes a backup before every change from the agent (⚙ → «Восстановить резервную копию»).
- Images are sent to the agent as `img#N` placeholders and restored on save.
- Agent code runs in `node:vm` with a 5 s limit. This is a time limit, not a security sandbox: it is meant for your own local agent.
