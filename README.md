# QR Analytics Studio

A dependency-free local QR code generator inspired by QR Monkey-style workflows: create styled QR codes, use dynamic short links, and track scan analytics for each code.

## Run

```sh
node server.js
```

Open `http://localhost:3000`.

## Vercel Tracking Setup

The hosted Vercel app needs persistent storage for scan analytics. Add a Vercel Marketplace Redis/Upstash integration to the project so these environment variables are available:

```txt
KV_REST_API_URL
KV_REST_API_TOKEN
```

The API also supports the equivalent Upstash names:

```txt
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

After storage is connected and Vercel redeploys, generated dynamic QR codes use `/r/:id` links on the deployed domain. Each scan records a visit and redirects to the destination URL.

## What It Does

- Creates QR codes for URLs, text, email, SMS, WiFi, vCard, and WhatsApp.
- Supports dynamic tracked QR codes through `/r/:id` redirect links.
- Lets you customize foreground, background, accent color, frame, size, error correction, and logo text.
- Exports PNG and SVG.
- Tracks total scans, unique visitors, last scan time, scans by day, device, browser, operating system, referrer, and recent scan history.

Data is stored locally in `data/store.json`, which is created automatically after the first QR code is saved.
