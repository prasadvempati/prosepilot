# ProsePilot Google Docs Add-on

Google Docs add-on for ProsePilot grammar checking.

## Project Structure

```
apps/google-docs-addon/
├── src/
│   ├── appsscript.json    # Manifest file
│   ├── Code.gs           # Main server-side code
│   ├── sidebar.html      # Main sidebar UI
│   └── settings.html     # Settings sidebar UI
└── package.json
```

## Deployment

### Prerequisites

1. Install clasp: `npm install -g @google/clasp`
2. Login: `clasp login`
3. Create a Google Cloud Project and enable the Google Docs API
3. Create a Google Apps Script project: `clasp create --type docs --title "ProsePilot"`

### Deploy

```bash
# Push code to Apps Script
clasp push

# Open the Apps Script editor
clasp open

# View logs
clasp logs
```

### Manual Deployment (Alternative)

1. Go to https://script.google.com
2. Create new project
3. Copy files from `src/` to the Apps Script editor:
   - Copy `src/Code.gs` to Code.gs
   - Create `sidebar.html` and `settings.html` files
   - Copy `src/appsscript.json` to project manifest (Project Settings → "Show manifest file" → copy content)
4. Deploy → New deployment → Type: Google Workspace Add-on

## Required Setup

### Google Cloud Console
1. Create project at https://console.cloud.google.com
2. Enable Google Docs API
3. Configure OAuth consent screen
4. Create OAuth 2.0 credentials
5. Add authorized redirect URIs from clasp

### ProsePilot API
The add-on calls the ProsePilot API at `https://prosepilot.io/v1/check`. Ensure:
- API is accessible
- CORS allows Google Apps Script origins
- Clerk token authentication works (stored in user properties)

## Features

- **Grammar checking** via ProsePilot API with local fallback
- **Voice Preservation Score** display
- **Ignored words** management (per user, synced via PropertiesService)
- **Privacy Policy** link
- **Issue reporting** via GitHub

## Architecture

- **Server-side (Code.gs)**: Document operations, API calls, sidebar rendering
- **Client-side (HTML/JS)**: Sidebar UI, issue display, settings management
- **Storage**: UserProperties for ignored words, Clerk token
- **API**: ProsePilot API at `https://prosepilot.io/v1/check`

## Testing

1. Deploy with `clasp push`
2. Open a Google Doc
2. Refresh the page
3. Look for "ProsePilot" in Add-ons menu
4. Click "Open ProsePilot" to open sidebar

## Publishing

To publish to Google Workspace Marketplace:

1. Complete OAuth verification in Google Cloud Console
2. Create store listing in Google Workspace Marketplace SDK
3. Submit for review

## Local Development

```bash
# Install clasp locally
npm install

# Push changes
npm run push

# View logs
npm run logs
```