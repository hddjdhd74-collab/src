/**
 * Instagram Viral Reel Script & Hook Extractor — Apify Actor
 *
 * Given reel URLs (or a hashtag/profile to search — see caveat below), fetches
 * each reel's caption + engagement stats, downloads the video, transcribes it
 * with OpenAI Whisper, and splits the transcript into a "hook" (the opening
 * few seconds) and the full "script".
 *
 * IMPORTANT, HONEST CAVEATS (verified live against real Instagram pages while
 * building this):
 *
 * 1. Video download only works when Instagram exposes a direct video_url for
 *    the reel. Reels built on licensed/popular music are frequently
 *    "copyright_blocked" and Instagram withholds the direct file entirely —
 *    there is no workaround for this without the audio itself, so those
 *    reels get pushed to the dataset with metadata only and a
 *    `transcriptionError` explaining why.
 * 2. Hashtag/profile discovery (the "search" input) is NOT reliable.
 *    Instagram's hashtag/tag pages require an authenticated session to
 *    return any post data — a plain unauthenticated request returns an
 *    empty shell with zero results (confirmed live). This actor will only
 *    attempt discovery if you supply "igSessionId" (an Instagram session
 *    cookie value), and even then Instagram may block it. Pasting specific
 *    reel URLs into "reelUrls" is the reliable path.
 */

import { Actor } from 'apify';

await Actor.init();

const input = (await Actor.getInput()) ?? {};

const {
    reelUrls = [],
    search = '',
    searchType = 'hashtag',
    // resultsType / onlyPostsNewerThan / skipPinnedPosts are accepted for
    // input-schema compatibility but NOT applied yet: Instagram's
    // unauthenticated tag/profile pages don't expose post dates or pinned
    // status, so there's nothing to filter on during discovery today.
    resultsLimit = 100,
    minViews = 0,
    minLikes = 0,
    includeTranscription = true,
    hookLengthSeconds = 3,
    openaiApiKey,
    igSessionId,
} = input;

if (reelUrls.length === 0 && !search) {
    throw new Error('Provide either "reelUrls" or "search" in the input.');
}

if (includeTranscription && !openaiApiKey) {
    throw new Error('"includeTranscription" is on but no "openaiApiKey" was provided.');
}

const USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function igHeaders() {
    const headers = { 'User-Agent': USER_AGENT };
    if (igSessionId) headers.Cookie = `sessionid=${igSessionId};`;
    return headers;
}

// Instagram embeds its page data as a JSON string INSIDE another JSON
// string (one extra layer of escaping vs. a normal API response), so a
// value like a URL needs to be unescaped twice to come out clean.
function doubleJsonUnescape(raw) {
    try {
        return JSON.parse(`"${JSON.parse(`"${raw}"`)}"`);
    } catch {
        try {
            return JSON.parse(`"${raw}"`);
        } catch {
            return raw;
        }
    }
}

function extractShortcode(url) {
    const m = url.match(/instagram\.com\/(?:reel|p|tv)\/([^/?]+)/);
    return m ? m[1] : null;
}

async function fetchReelMetadata(url) {
    const shortcode = extractShortcode(url);
    if (!shortcode) {
        console.warn(`Could not parse a shortcode from "${url}" — skipping.`);
        return null;
    }

    const res = await fetch(url, { headers: igHeaders() });
    if (!res.ok) {
        console.warn(`Fetching ${url} returned HTTP ${res.status} — skipping.`);
        return null;
    }
    const html = await res.text();

    const videoUrlMatch = html.match(/\\"video_url\\":\\"(.*?)\\"/);
    const captionMatch = html.match(
        /\\"edge_media_to_caption\\":\{\\"edges\\":\[\{\\"node\\":\{\\"text\\":\\"(.*?)\\"\}\}/,
    );
    const likesMatch = html.match(/\\"edge_liked_by\\":\{\\"count\\":(\d+)\}/);
    const viewsMatch = html.match(/\\"video_view_count\\":(\d+)/);
    const commentsMatch = html.match(/\\"edge_media_to_comment\\":\{\\"count\\":(\d+)\}/);
    const ownerMatch = html.match(/\\"owner\\":\{\\"id\\":\\"\d+\\",\\"username\\":\\"([^\\"]+)\\"/);

    return {
        url,
        shortcode,
        username: ownerMatch?.[1] ?? null,
        caption: captionMatch ? doubleJsonUnescape(captionMatch[1]) : null,
        likesCount: likesMatch ? Number(likesMatch[1]) : null,
        viewsCount: viewsMatch ? Number(viewsMatch[1]) : null,
        commentsCount: commentsMatch ? Number(commentsMatch[1]) : null,
        videoUrl: videoUrlMatch ? doubleJsonUnescape(videoUrlMatch[1]) : null,
        videoBlockedReason: videoUrlMatch
            ? null
            : 'Instagram withheld the direct video file for this reel (common for reels using licensed/popular music) — cannot transcribe it.',
    };
}

async function discoverReelUrls() {
    if (reelUrls.length > 0) return reelUrls;

    if (!igSessionId) {
        throw new Error(
            'No "reelUrls" given and no "igSessionId" provided, so hashtag/profile discovery ' +
                'cannot work — Instagram blocks anonymous access to hashtag/profile post data ' +
                '(confirmed while building this actor: an unauthenticated request returns zero ' +
                'results). Either paste specific reel URLs into "reelUrls", or supply an ' +
                '"igSessionId" cookie value from a logged-in Instagram session.',
        );
    }

    console.warn(
        'Attempting hashtag/profile discovery with the supplied igSessionId — this is ' +
            'best-effort and may still be blocked or rate-limited by Instagram.',
    );

    const terms = search
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    const discovered = [];

    for (const term of terms) {
        const tagUrl =
            searchType === 'user'
                ? `https://www.instagram.com/${encodeURIComponent(term)}/`
                : `https://www.instagram.com/explore/tags/${encodeURIComponent(term)}/`;
        const res = await fetch(tagUrl, { headers: igHeaders() });
        if (!res.ok) {
            console.warn(`Discovery fetch for "${term}" returned HTTP ${res.status} — skipping.`);
            continue;
        }
        const html = await res.text();
        const shortcodeMatches = [...html.matchAll(/\\"shortcode\\":\\"([A-Za-z0-9_-]{5,})\\"/g)];
        const uniqueShortcodes = [...new Set(shortcodeMatches.map((m) => m[1]))].slice(0, resultsLimit);
        for (const sc of uniqueShortcodes) {
            discovered.push(`https://www.instagram.com/reel/${sc}/`);
        }
    }

    if (discovered.length === 0) {
        throw new Error(
            'Discovery found 0 reels even with igSessionId — Instagram likely blocked or ' +
                'rejected the request. Try supplying "reelUrls" directly instead.',
        );
    }
    return discovered;
}

async function transcribeVideo(videoUrl) {
    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok) {
        console.warn(`Failed to download video (HTTP ${videoRes.status}) — skipping transcription.`);
        return null;
    }
    const buffer = Buffer.from(await videoRes.arrayBuffer());

    const MAX_BYTES = 24 * 1024 * 1024; // OpenAI's transcription endpoint caps requests at 25MB
    if (buffer.length > MAX_BYTES) {
        console.warn(
            `Video is ${(buffer.length / 1e6).toFixed(1)}MB, over Whisper's 25MB limit — skipping transcription.`,
        );
        return null;
    }

    const form = new FormData();
    form.append('file', new Blob([buffer], { type: 'video/mp4' }), 'reel.mp4');
    form.append('model', 'whisper-1');
    form.append('response_format', 'verbose_json');

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openaiApiKey}` },
        body: form,
    });
    if (!res.ok) {
        const errText = await res.text();
        console.warn(`Whisper transcription failed (HTTP ${res.status}): ${errText.slice(0, 300)}`);
        return null;
    }
    return res.json(); // { text, segments: [{ start, end, text }, ...], ... }
}

function splitHookAndScript(transcription) {
    if (!transcription) return { hook: null, script: null };
    const segments = transcription.segments ?? [];
    const hookSegments = segments.filter((s) => s.start < hookLengthSeconds);
    const hook =
        hookSegments.length > 0
            ? hookSegments.map((s) => s.text.trim()).join(' ')
            : (transcription.text?.split(/(?<=[.!?])\s/)[0] ?? null);
    return { hook, script: transcription.text ?? null };
}

const urlsToProcess = await discoverReelUrls();
console.log(`Processing ${urlsToProcess.length} reel URL(s)...`);

let processed = 0;
for (const url of urlsToProcess) {
    const meta = await fetchReelMetadata(url);
    if (!meta) continue;

    if (meta.viewsCount != null && meta.viewsCount < minViews) continue;
    if (meta.likesCount != null && meta.likesCount < minLikes) continue;

    let hook = null;
    let script = null;
    let transcriptionError = meta.videoBlockedReason ?? null;

    if (includeTranscription && meta.videoUrl) {
        const transcription = await transcribeVideo(meta.videoUrl);
        if (transcription) {
            ({ hook, script } = splitHookAndScript(transcription));
        } else {
            transcriptionError = transcriptionError ?? 'Transcription failed — see actor log for details.';
        }
    }

    await Actor.pushData({
        url: meta.url,
        shortcode: meta.shortcode,
        username: meta.username,
        caption: meta.caption,
        likesCount: meta.likesCount,
        viewsCount: meta.viewsCount,
        commentsCount: meta.commentsCount,
        videoUrl: meta.videoUrl,
        hook,
        script,
        transcriptionError,
    });
    processed += 1;
}

console.log(`Done. Pushed ${processed} item(s) to the dataset.`);

await Actor.exit();
