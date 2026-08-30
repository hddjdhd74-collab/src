# Instagram Viral Reel Script & Hook Extractor

An Apify Actor scaffold: discover Instagram reels by hashtag or profile,
filter to the top performers, and extract each reel's spoken transcript so
you can pull out the hook (opening line) and full script.

## Repo layout

```
.actor/
  actor.json          Apify Actor metadata (name, title, entrypoint)
  INPUT_SCHEMA.json    Input form Apify Console renders for this Actor
src/
  main.js              Actor entrypoint — currently a STUB (see below)
examples/
  input.json           Example input: specific reel URLs, transcription on
  bulk_discovery_input.json   Example input: discover reels via hashtag search
Dockerfile             Apify base image + npm start
package.json           Node deps (apify SDK)
```

## Status: scaffold, not a working scraper yet

`src/main.js` validates and echoes the input so the Actor builds and runs
end-to-end on Apify, but it does **not** yet actually scrape Instagram or
transcribe audio. It's a working skeleton to build the real logic into —
see the TODO comments at the top of `src/main.js` for what's needed:
1. Discovery (hashtag/profile search when `reelUrls` isn't given)
2. Filtering by `minViews` / `minLikes`
3. Transcription (e.g. via OpenAI Whisper, using `openaiApiKey`)
4. Splitting the transcript into `hook` (first few seconds) + `script` (rest)

If you'd rather not build that yourself, running an existing published Apify
Actor is faster — see below.

## Fastest path: use an existing published Actor instead

`examples/input.json` is shaped for the **Instagram Reel Analyzer** Actor
already on Apify (`electrifying_haircut/instagram-reel-analyzer`):

```bash
curl -X POST "https://api.apify.com/v2/acts/electrifying_haircut~instagram-reel-analyzer/runs?token=YOUR_APIFY_TOKEN" \
  -H "Content-Type: application/json" \
  -d @examples/input.json
```

`examples/bulk_discovery_input.json` is shaped for Apify's general
`apify/instagram-scraper` Actor in hashtag-search mode, for discovering many
reel URLs before running the extractor above on them.

Apify store links:
- https://apify.com/electrifying_haircut/instagram-reel-analyzer
- https://apify.com/apify/instagram-scraper

**Note:** third-party Actor input schemas can change between versions —
check the live "Input" tab on each Actor's page before a real run.

## Running this scaffold locally

```bash
npm install
npm start
```

By default `Actor.getInput()` reads from `storage/key_value_stores/default/INPUT.json`
if present, or falls back to Apify's local dev defaults — see the
[Apify SDK docs](https://docs.apify.com/sdk/js) for local run configuration.

## Deploying to Apify

```bash
npm install -g apify-cli
apify login
apify push
```
