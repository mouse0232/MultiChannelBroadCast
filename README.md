English|[简体中文](./README.zh-cn.md)
# Multi-Channel Broadcast

**Aggregate multiple Telegram channels into a single microblog** - inspired by [BroadcastChannel](https://github.com/ccbikai/BroadcastChannel).

## Architecture

This project uses a **frontend-backend separated architecture**:

- **Frontend**: Astro static site generation, deployed on Cloudflare Pages
- **Backend**: Cloudflare Worker with D1 database for async content crawling
- **Caching**: D1 persistent storage (no LRU cache needed)
- **Queue**: Cloudflare Queues for parallel channel processing

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Astro Pages │────>│  Cloudflare      │────>│  D1 Database     │
│  (Frontend)  │     │  Worker (API)    │     │  (SQLite)        │
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
- Full-text search
- RSS feed
- Mobile responsive design
- Telegram comments integration

## Tech Stack

- **Frontend**: [Astro](https://astro.build/) v4.15+
- **Backend**: Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite)
- **Queue**: Cloudflare Queues
- **Parser**: Cheerio
- **Image Proxy**: wsrv.nl
- **Video Proxy**: Worker local proxy (with Range support)

## Quick Start

### 1. Deploy Worker (Backend)

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

### 2. Deploy Pages (Frontend)

Connect the GitHub repository to Cloudflare Pages:
- **Build command**: `pnpm build`
- **Output directory**: `dist`

Set environment variables:
- `WORKER_URL` - your Worker URL (e.g., `https://your-worker.workers.dev`)
- `SITE_NAME` - site name
- `CHANNELS` - same as Worker config

Visit your site URL to see the result.

### Local Development

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
| `COMMENTS` | Pages | Enable Telegram comments |
| `GOOGLE_SEARCH_SITE` | Pages | Google search site |
| `HEADER_INJECT` | Pages | HTML injection in head |
| `FOOTER_INJECT` | Pages | HTML injection in footer |
| `NAVS` | Pages | Custom navigation links |

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

| Type | Method | URL Pattern |
|------|--------|-------------|
| Images | wsrv.nl CDN | `https://wsrv.nl/?url={encoded}` |
| Video/Audio | Worker proxy | `/static/{host}/{path}` |

## Pagination

Cursor-based pagination using `published_at`:

- **Homepage**: `ORDER BY published_at DESC LIMIT 20`
- **Older**: `published_at < {cursor}`
- **Newer**: `published_at > {cursor}`

## FAQ

### Why use D1 instead of in-memory cache?

D1 provides persistent storage, so content survives server restarts and is shared across all edge nodes. This eliminates the need for LRU cache and provides consistent performance.

### How often is content updated?

By default, Cloudflare Cron triggers every 5 minutes. You can adjust the cron schedule in `wrangler.toml`.

### Why can't I see images in posts?

Old posts may have been crawled before the image extraction feature was added. Visit `/api/regrab` to re-crawl and update existing posts.

## Project Docs

Detailed documentation is available at `.monkeycode/docs/`:
- [Architecture](./.monkeycode/docs/ARCHITECTURE.md)
- [Interfaces](./.monkeycode/docs/INTERFACES.md)
- [Developer Guide](./.monkeycode/docs/DEVELOPER_GUIDE.md)

## Contributing

Issues and Pull Requests are welcome!

## License

MIT

## Thanks

[BroadcastChannel](https://github.com/ccbikai/BroadcastChannel)

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=mouse0232/MultiChannelBroadCast&type=date&legend=top-left)](https://www.star-history.com/#mouse0232/MultiChannelBroadCast&type=date&legend=top-left)
