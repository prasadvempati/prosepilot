# ProsePilot Word Add-in

AI-powered grammar checker for Microsoft Word.

## Prerequisites

- Node.js 18+
- Microsoft Word (desktop or web)
- Yo Office generator (for dev): `npm install -g yo generator-office`

## Local Development

### Option 1: Quick Start (HTTPS localhost)

1. Install a local HTTPS server:
   ```bash
   npm install -g local-ssl-server
   ```

2. Start the server from the `word-addin` directory:
   ```bash
   cd apps/word-addin
   npx local-ssl-server --port 3000
   ```

3. Sideload in Word:
   - **Word Desktop**: File → Options → Trust Center → Trust Center Settings → Trusted Add-in Catalogs → add `https://localhost:3000`
   - **Word Web**: Insert → My Add-ins → Upload My Add-in → select `manifest.xml`

### Option 2: Use Yo Office

```bash
cd apps/word-addin
yo office --name ProsePilot --host document --type taskpane
```

Then replace the generated files with the ones in this directory.

## How It Works

1. Click the **ProsePilot** tab in Word ribbon
2. Click **Check** to scan the document
3. Issues appear in the task pane
4. Click **Accept** to fix, **Skip** to ignore
5. Click **Auto-Fix** to fix all high-confidence issues at once

## Architecture

- `manifest.xml` — Office add-in manifest (defines ribbon, task pane, permissions)
- `index.html` — Task pane UI
- `app.js` — Office.js integration + grammar checking
- `app.css` — Task pane styling
- `functions.html` — Required for ribbon button actions

## API Integration

The add-in calls `POST https://prosepilot.io/v1/check` with `{ "text": "..." }` and receives `{ "issues": [...] }`.

If the API is unavailable, a local fallback handles:
- Double words ("the the")
- Capitalization after periods
- Missing periods at end of sentences
- Missing commas after introductory clauses
