/**
 * Instagram Viral Reel Script & Hook Extractor — Apify Actor
 *
 * STUB / SCAFFOLD: this file wires up the Actor's input/output contract so
 * the repo runs end-to-end on Apify, but the actual scraping + transcription
 * logic is NOT implemented yet — it currently just echoes the resolved
 * input back out as a single dataset item so you can confirm the Actor
 * builds and the input form (.actor/INPUT_SCHEMA.json) works.
 *
 * To make this real, wire in:
 *   1. Discovery: call an Instagram scraping source (e.g. the Apify
 *      `apify/instagram-scraper` actor via the Apify API, or your own
 *      scraping logic) using `search` / `searchType` / `resultsType` /
 *      `resultsLimit` / `onlyPostsNewerThan` when `reelUrls` is empty.
 *   2. Filtering: drop reels below `minViews` / `minLikes`.
 *   3. Transcription: send each reel's video to a speech-to-text service
 *      (e.g. OpenAI Whisper, using `openaiApiKey`) to get the transcript.
 *   4. Hook split: slice the first `hookLengthSeconds` of the transcript
 *      into a `hook` field, keep the rest as `script`.
 */

import { Actor } from 'apify';

await Actor.init();

const input = await Actor.getInput() ?? {};

const {
    reelUrls = [],
    search = '',
    searchType = 'hashtag',
    resultsType = 'reels',
    resultsLimit = 100,
    onlyPostsNewerThan = '6 months',
    minViews = 100000,
    minLikes = 0,
    skipPinnedPosts = true,
    includeTranscription = true,
    hookLengthSeconds = 3,
    openaiApiKey,
} = input;

Actor.log.info('Received input', {
    reelUrlsCount: reelUrls.length,
    search,
    searchType,
    resultsType,
    resultsLimit,
    onlyPostsNewerThan,
    minViews,
    minLikes,
    skipPinnedPosts,
    includeTranscription,
    hookLengthSeconds,
    hasOpenaiApiKey: Boolean(openaiApiKey),
});

if (reelUrls.length === 0 && !search) {
    throw new Error('Provide either "reelUrls" or "search" in the input.');
}

// TODO: replace this placeholder with real discovery + transcription logic.
await Actor.pushData({
    note: 'STUB OUTPUT — implement discovery/filtering/transcription in src/main.js',
    resolvedInput: input,
});

await Actor.exit();
