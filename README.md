English|[简体中文](./README.zh-cn.md)
# Multi-Channel Broadcast

**Aggregate multiple Telegram channels into a single microblog** - inspired by [BroadcastChannel](https://github.com/ccbikai/BroadcastChannel).

[![Build](https://github.com/mouse0232/MultiChannelBroadCast/actions/workflows/docker-build.yml/badge.svg)](https://github.com/mouse0232/MultiChannelBroadCast/actions)
[![Docker](https://ghcr-badge.egpl.dev/mouse0232/MultiChannelBroadCast/latest_tag?label=docker)](https://github.com/mouse0232/MultiChannelBroadCast/pkgs/container/MultiChannelBroadCast)
[![License](https://img.shields.io/github/license/mouse0232/MultiChannelBroadCast)](https://github.com/mouse0232/MultiChannelBroadCast/blob/main/LICENSE)

## Quick Start

### 🐳 Docker Deployment (Recommended for Beginners)

One-click installation for non-technical users:

```bash
# Download installation script
curl -fsSL https://raw.githubusercontent.com/mouse0232/MultiChannelBroadCast/main/install.sh -o install.sh

# Run installation
chmod +x install.sh
./install.sh
```

The script will:
- ✅ Check Docker environment
- ✅ Download configuration files
- ✅ Guide you to configure environment variables
- ✅ Pull Docker image from GHCR
- ✅ Start the service automatically

**Manual Installation**:

```bash
# Create working directory
mkdir -p ~/multi-channel-broadcast
cd ~/multi-channel-broadcast

# Download configuration files
curl -LO https://raw.githubusercontent.com/mouse0232/MultiChannelBroadCast/main/docker-compose.yml
curl -LO https://raw.githubusercontent.com/mouse0232/MultiChannelBroadCast/main/.env.example

# Configure environment variables
cp .env.example .env
vim .env  # Edit CHANNELS, API_SECRET_KEY, etc.

# Pull and start
docker pull ghcr.io/mouse0232/MultiChannelBroadCast:latest
docker-compose up -d
```

📖 **Full Documentation**: [DOCKER_DEPLOYMENT.md](.monkeycode/docs/DOCKER_DEPLOYMENT.md)

## Architecture

This project uses a **frontend-backend separated architecture**:

- **Frontend**: Astro SSR (Server Output), deployed on Cloudflare Pages / Vercel / Netlify
- **Backend**: Cloudflare Worker with D1 database for async content crawling
- **Caching**: D1 persistent storage + Cloudflare Cache API (optional)
- **Queue**: Cloudflare Queues for parallel channel processing

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Astro SSR  │────>│  Cloudflare      │────>│  D1 Database     │
│  (Frontend) │     │  Worker (API)    │     │  (SQLite)        │
└─────────────┘     └──────────────────┘     └──────────────────┘
                            │
                            │ Cron + Queue
                            ▼
                     ┌──────────────────┐
                     │  Telegram Crawler │
                     │  (Async/Parallel) │
                     └──────────────────┘
```

## Features

- Multi-channel aggregation with pagination
- Async content crawling (Cron + Queue)
- Rich media support (images via wsrv.nl, video/audio via Worker proxy)
- Telegram push notifications (with image support)
- Anti-rate-limiting (UA pool, host rotation, random delays)
- Keyword filtering (regex support, blacklist/whitelist modes)
- Full-text search
- RSS feed
- Mobile responsive design
- Telegram comments integration

## Tech Stack

- **Frontend**: [Astro](https://astro.build/) v4.15+ (SSR / Server Output)
- **Backend**: Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite)
- **Queue**: Cloudflare Queues
- **Cache**: Cloudflare Cache API (optional)
- **Parser**: Cheerio
- **Image Proxy**: wsrv.nl / R2 (optional)
- **Video Proxy**: Worker local proxy (with Range support)

## Quick Start

### 🐳 Docker Deployment (Recommended for Beginners)

One-click installation for non-technical users:

```bash
# Download installation script
curl -fsSL https://raw.githubusercontent.com/mouse0232/MultiChannelBroadCast/main/install.sh -o install.sh

# Run installation
chmod +x install.sh
./install.sh
```

The script will:
- ✅ Check Docker environment
- ✅ Download configuration files
- ✅ Guide you to configure environment variables
- ✅ Pull Docker image from GHCR
- ✅ Start the service automatically

**Manual Installation**:

```bash
# Create working directory
mkdir -p ~/multi-channel-broadcast
cd ~/multi-channel-broadcast

# Download configuration files
curl -LO https://raw.githubusercontent.com/mouse0232/MultiChannelBroadCast/main/docker-compose.yml
curl -LO https://raw.githubusercontent.com/mouse0232/MultiChannelBroadCast/main/.env.example

# Configure environment variables
cp .env.example .env
vim .env  # Edit CHANNELS, API_SECRET_KEY, etc.

# Pull and start
docker pull ghcr.io/mouse0232/MultiChannelBroadCast:latest
docker-compose up -d
```

📖 **Full Documentation**: [DOCKER_DEPLOYMENT.md](.monkeycode/docs/DOCKER_DEPLOYMENT.md)

### ☁️ Cloudflare Deployment (Advanced Users)

```bash
# Clone the project
git clone https://github.com/mouse0232/MultiChannelBroadCast.git
cd MultiChannelBroadCast

# Install Wrangler CLI
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Create D1 database
wrangler d1 create multi-channel-db

# Update database_id in wrangler.toml

# Deploy Worker
wrangler deploy
```

Set environment variables in Cloudflare Dashboard:
- `CHANNELS` - comma-separated channel list (required)
- `TELEGRAM_BOT_TOKEN` - for push notifications
- `TELEGRAM_PUSH_CHANNEL_ID` - target channel for push
- `TELEGRAM_PUSH_ENABLED` - set to `true` to enable push
- `FILTER_ENABLED` - set to `true` to enable keyword filtering (optional)

**2. Deploy Pages (Frontend)**

Connect the GitHub repository to Cloudflare Pages:
- **Build command**: `pnpm build`
- **Output directory**: `dist`

Set environment variables:
- `WORKER_URL` - your Worker URL (e.g., `https://your-worker.workers.dev`)
- `SITE_NAME` - site name
- `CHANNELS` - same as Worker config

Visit your site URL to see the result.

**3. Local Development**

pnpm install

```bash
# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env

# Edit .env file (set WORKER_URL and CHANNELS)

# Start dev server
pnpm dev
```

Visit `http://localhost:4321` to see the result.

### Local Development with Docker

```bash
# Build and run
docker-compose up --build

# Or run in background
docker-compose up -d
```

Visit `http://localhost:4321` to see the result.

📖 **More Docker Documentation**:
- [Deployment Guide](.monkeycode/docs/DOCKER_DEPLOYMENT.md)
- [Testing Guide](DOCKER_TESTING_GUIDE.md)
- [GitHub Actions](.github/workflows/README_DOCKER_RELEASE.md)

## Configuration

### Core Configuration

| Variable | Platform | Description |
|----------|----------|-------------|
| `CHANNELS` | Worker | Comma-separated channel list (required) |
| `WORKER_URL` | Pages | Worker API URL |
| `SITE_NAME` | Pages | Site name |
| `SITE_AVATAR` | Pages | Site avatar URL |
| `LOCALE` | Pages | Language code (default: zh-cn) |
| `TIMEZONE` | Pages | Timezone (default: Asia/Shanghai) |
| `SERVER_ADAPTER` | Pages | Adapter provider (vercel/cloudflare_pages/netlify/node) |

### Push Notifications

| Variable | Platform | Description |
|----------|----------|-------------|
| `TELEGRAM_PUSH_ENABLED` | Worker | Set `true` to enable |
| `TELEGRAM_BOT_TOKEN` | Worker | Bot Token from @BotFather |
| `TELEGRAM_PUSH_CHANNEL_ID` | Worker | Target channel (@name or -100xxx) |

### Advanced

| Variable | Platform | Description |
|----------|----------|-------------|
| `TELEGRAM_HOST` | Worker | Telegram host (supports rotation) |
| `FILTER_ENABLED` | Worker | Set `true` to enable keyword filtering |
| `COMMENTS` | Pages | Enable Telegram comments |
| `GOOGLE_SEARCH_SITE` | Pages | Google search site |
| `HEADER_INJECT` | Pages | HTML injection in head |
| `FOOTER_INJECT` | Pages | HTML injection in footer |
| `NAVS` | Pages | Custom navigation links |
| `RSS_PREFIX` | Pages | RSS URL prefix |
| `RSS_URL` | Pages | Full RSS feed URL |
| `TAGS` | Pages | Enable tags feature |
| `LINKS` | Pages | Enable links feature |
| `TELEGRAM` | Pages | Telegram username link |
| `TWITTER` | Pages | Twitter username link |
| `GITHUB` | Pages | GitHub username link |

## Worker API

| Endpoint | Description |
|----------|-------------|
| `GET /api/posts` | Get posts list (with pagination) |
| `GET /api/posts/search` | Search posts |
| `GET /api/post/{id}` | Get single post |
| `GET /api/channels` | Get channels list |
| `GET /api/init` | Initialize and crawl all channels |
| `GET /api/regrab` | Re-crawl and update old posts |
| `GET /static/*` | Video/audio proxy |

## Media Proxy

### Image Proxy

| Method | URL Pattern | Description |
|--------|-------------|-------------|
| wsrv.nl CDN | `https://wsrv.nl/?url={encoded}` | Default, with CDN cache |
| R2 Storage | `/r2/{key}` | Optional, persistent storage |

### Video/Audio Proxy

| Method | URL Pattern | Description |
|--------|-------------|-------------|
| Worker proxy | `/static/{host}/{path}` | With Range request support |

**Note**: wsrv.nl is recommended for images as it provides free CDN and cache. R2 can be used for better control and compliance.

## Pagination

Cursor-based pagination using `published_at`:

- **Homepage**: `ORDER BY published_at DESC LIMIT 20`
- **Older**: `published_at < {cursor}`
- **Newer**: `published_at > {cursor}`

## Keyword Filtering

### Enable Filtering

1. Edit `filter-rules.json` configuration file
2. Set environment variable `FILTER_ENABLED=true`
3. Redeploy Worker

### Configuration Format

```json
{
  "global": {
    "mode": "blacklist",
    "rules": [
      {
        "id": "1",
        "pattern": "spam",
        "ruleType": "keyword",
        "isActive": true,
        "description": "Filter spam content"
      },
      {
        "id": "2",
        "pattern": "spam|advertisement",
        "ruleType": "regex",
        "isActive": true,
        "description": "Filter ads with regex"
      }
    ]
  },
  "channels": {
    "channel1": {
      "mode": "blacklist",
      "inheritGlobal": true,
      "rules": []
    }
  }
}
```

### Filter Modes

| Mode | Description |
|------|-------------|
| `blacklist` | Block posts matching any rule |
| `whitelist` | Only allow posts matching at least one rule |

### Rule Types

| Type | Description | Example |
|------|-------------|---------|
| `keyword` | Case-insensitive substring match | `advertisement` |
| `regex` | Regular expression match | `spam\|advertisement` |

### Channel Inheritance

- Channels without explicit rules inherit global rules automatically
- Set `inheritGlobal: false` to disable inheritance
- Channel-specific rules merge with inherited rules

### Fault Tolerance

- JSON format errors won't crash the Worker
- Config load failures fallback to "no-filter" mode
- Invalid regex patterns are skipped with error logging

## FAQ

### Why use D1 instead of in-memory cache?

D1 provides persistent storage, so content survives server restarts and is shared across all edge nodes. This eliminates the need for LRU cache and provides consistent performance.

### How often is content updated?

By default, Cloudflare Cron triggers every 5 minutes. You can adjust the cron schedule in `wrangler.toml`.

### Why can't I see images in posts?

Old posts may have been crawled before the image extraction feature was added. Visit `/api/regrab` to re-crawl and update existing posts.

### Why does the homepage only show one channel's content?

Check:
1. Worker environment variable `CHANNELS` is configured with multiple channels
2. Frontend `WORKER_URL` points to the correct Worker address
3. D1 database actually contains data from multiple channels

### Why are pagination links returning 404?

Ensure:
1. `before/[cursor].astro` and `after/[cursor].astro` exist
2. Pagination cursors are encoded with `encodeURIComponent()`
3. Pagination uses `published_at` field instead of `id` (to avoid slash issues)

### Why can't videos play or seek?

Check:
1. `/static/` route is correctly handled in Worker
2. Range request headers are properly forwarded
3. Content-Range response headers are correctly returned

### How to disable push notifications?

Set `TELEGRAM_PUSH_ENABLED=false` or remove this environment variable.

### Cron is not triggering scraping?

Check:
1. Cron trigger is correctly configured in `wrangler.toml`
2. Worker is deployed
3. Queue is correctly bound
4. Check Worker logs: `wrangler tail`

## Project Docs

Detailed documentation is available at `.monkeycode/docs/`:

**Core Documentation**:
- [Architecture](./.monkeycode/docs/ARCHITECTURE.md)
- [Interfaces](./.monkeycode/docs/INTERFACES.md)
- [Developer Guide](./.monkeycode/docs/DEVELOPER_GUIDE.md)

**Docker Deployment**:
- [Deployment Guide](.monkeycode/docs/DOCKER_DEPLOYMENT.md) - Complete Docker deployment tutorial
- [Testing Guide](DOCKER_TESTING_GUIDE.md) - Docker testing guide
- [Docker Release](.github/workflows/README_DOCKER_RELEASE.md) - GitHub Actions auto-build guide

## Contributing

Issues and Pull Requests are welcome!

## License

MIT

## Thanks

[BroadcastChannel](https://github.com/ccbikai/BroadcastChannel)

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=mouse0232/MultiChannelBroadCast&type=date&legend=top-left)](https://www.star-history.com/#mouse0232/MultiChannelBroadCast&type=date&legend=top-left)
