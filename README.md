# Song Sense

A multiplayer word-guessing party game you play in the browser. One player is the **picker**: they secretly choose 1 of 3 random words (an emotion, an adjective or a scenario) and hint at it with up to **three Spotify songs**, added one at a time. Everyone else listens and **types guesses** in the chat. The sooner you guess, and the fewer songs you needed, the more you score.

No accounts, no database, no runtime dependencies (plain Node). Rooms live in server memory.

## Look and avatars

The interface is a bright "Aero" glass-window theme (design tokens and components live at the top of `public/index.html`). Every player builds a cartoon head-and-shoulders avatar in the built-in **Avatar Maker** (click your avatar on the home page or "Edit my avatar" in the lobby): hair style, bangs and color, eye shape and color, eyebrows, expression, blush, freckles, facial markings, skin tone, tops and colors, and accessories (headphones, earbuds, glasses, beanie, clips, bow, music note), with Randomize, Reset and Save. A first-time visitor gets a random avatar.

* `public/avatar.js` assembles each avatar from independent SVG layers (back hair, clothing, neck, head, face, front hair, accessories) from a small config of option indexes, so it is crisp at any size and needs no image files or AI generation. The server loads the same file to validate configs, so the schema lives in one place.
* The config is saved in the browser (`localStorage`), sent when you join or edit, and shown in the lobby, player list and results. Invalid configs are ignored (the client shows a stable default made from the name).
* Avatars react: excited when you guess right or the picker is winning, confused after a wrong guess (a few seconds), happy or sad on the results and final screens. Players also toggle **Ready** in the lobby (the host can start anyway).

## How a game works

1. The host creates a game and shares the invite link or 4-letter code. Up to 12 players. The host chooses word categories, guessing time (60/90/120 s) and turns each (1 to 3).
2. Each round the picker changes (random order, everyone picks once per turn). The picker has 20 s to choose 1 of 3 words (a random one is chosen if they stall).
3. The picker adds song 1 (they have 60 s). The guessing clock starts. Songs 2 and 3 are optional extra hints at any time.
4. Guessers type guesses. Wrong guesses are visible to everyone (like Skribbl). A correct guess is announced as "X got it!" with the text hidden; that player then chats privately with the others who got it, and the picker. The picker cannot chat during the round.
5. The round ends when everyone online has guessed, the clock runs out, or the picker never adds a song. The answer and results are shown, then the next round starts automatically (the host can skip the wait).
6. After everyone has been picker, the final leaderboard appears. The host can play again.

### Scoring (server-side, `lib/scoring.js`)

| Who | Points |
| --- | --- |
| Guesser | `100 to 500` by how much of the clock was left, times **1.0 / 0.7 / 0.5** if they needed 1 / 2 / 3 songs |
| Picker | 25% of every correct guesser's points |

### Guess matching (`lib/match.js`)

Case, punctuation, accents, a leading "a/an/the", simple plurals and spacing ("roadtrip") are ignored. One typo is allowed for words of 6 to 9 letters, two for 10+; shorter words must be exact, so sad/mad and tense/dense never get confused. A guess that contains the answer as whole words ("i think it's joy") counts. Words may list **aliases** (`angry=anger/mad`) that also count. A near miss gets a private "So close!". Add or edit words and aliases in `lib/words.js` (about 200 emotions, 290 adjectives and 225 scenarios).

The secret word is only ever sent to the picker, to players who have guessed it, and to everyone once the round ends. Guess checking and scoring happen on the server.

## Run it locally

Needs Node 20+.

```bash
npm start            # http://localhost:3000
npm test             # unit tests + full multi-player end-to-end game
node scripts/bot.js ROOMCODE 2   # add 2 simulated players to a game you created
```

Environment variables (never commit values; set them in your shell or in Render's Environment tab):

| Variable | Purpose |
| --- | --- |
| `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` | Optional. Enables in-app song search (server-side client credentials). Without them, pickers paste a Spotify song link. |
| `PORT` | Set by Render. |
| `TRUST_PROXY` | `0` only if the app is not behind a proxy (default trusts `X-Forwarded-For` for rate limiting). |
| `SPEED` | Test hook that shrinks all timers (e.g. `0.1`). Leave unset in production. |

## Deploy on Render (new service)

Do this only after you are ready to publish. The repo should be **private** on GitHub.

1. Create a **private** GitHub repo (for example `song-sense`) and push this folder to it.
2. In Render: **New + > Blueprint**, pick the repo. Render reads `render.yaml` (one `starter` web service, 1 instance; rooms are in memory, so do not scale horizontally and do not use the free tier, which sleeps and wipes games).
3. Open the new service > **Environment** and add `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` (the keys are not copied from your Score It service). Save; Render redeploys.
4. Check `https://<service>.onrender.com/healthz` returns `ok`, then play a round with a second device.

### Your own domain (songsense.io or aux.io)

You register the domain yourself (any registrar: Namecheap, Porkbun, Cloudflare, Google Domains successor, etc.). Check availability first, since `.io` names cost more per year and `aux.io` may be taken.

1. Render service > **Settings > Custom Domains > Add Custom Domain**. Add both `songsense.io` and `www.songsense.io`.
2. Render shows the exact DNS records. At your registrar's DNS page add them: normally a `CNAME` for `www` pointing to `<service>.onrender.com`, and for the bare domain an `A` record (or `ALIAS`/`ANAME` if your DNS host supports it) to the address Render shows. Remove any conflicting existing `A`/`AAAA` records first.
3. Back in Render click **Verify**. DNS can take minutes to hours. Render then issues the TLS certificate automatically and redirects www/apex as configured.
4. Invite links use whatever host the page was opened on, so nothing else needs changing.

## Spotify notes

* Playback uses **Spotify's official embedded player only**, started by the player's own play button. The frame around it shows art, title and artist, but there are deliberately no custom play controls or audio-driven visuals (Spotify's iFrame API would need `unsafe-eval` in the page's CSP). Song Sense never streams or proxies audio, and shows **no images or video timed to the audio**, which keeps it clear of Spotify Developer Policy III.6 (no syncing sound recordings with visual media).
* Spotify **Development Mode** limits (as of early 2026): the app owner needs Premium, the app is capped at a handful of allowlisted users for API features, and search returns at most 10 results. Only **search** uses the API; the paste-a-link fallback (which uses Spotify's public oEmbed) keeps the game fully playable if search is limited or unavailable. Embeds play 30-second previews to listeners who are not signed in to Spotify in their browser.
* Opening the game to the public with search enabled needs Spotify's extended-access review. Until then, search works for allowlisted accounts and everyone else can paste links.
* Never paste API keys into chat, issues or code. If a key was ever exposed, rotate it in the Spotify developer dashboard.

## Privacy

No accounts, ads, analytics or tracking cookies. Display names, guesses and chat exist only in server memory for the life of a game (rooms are deleted a few hours after the last activity or on restart). The browser stores a random player ID and name in `localStorage` for reconnecting. Spotify's embed may set its own cookies. The full text is in the app (Privacy link on the home page). If you collect any of this data beyond the above, update the notice.

## Security notes

* No secrets in the repo or browser; Spotify keys are read from the environment on the server.
* Strict CSP (scripts from self only; frames only from `open.spotify.com`), all user text is escaped, names and chat are stripped of control characters and `<>`.
* Input validation on every endpoint, 20 KB body limit, per-IP rate limits (global, create, join, search, songs, guesses) plus a per-player message cooldown.
* Room codes are 4 letters, so a determined person could guess one and join an open lobby: rooms hold no private data, and join attempts are rate limited. Treat it as a party game, not a secure channel.

## Layout

```
server.js          HTTP server, rooms, game flow, routes
lib/match.js       fuzzy guess matching
lib/scoring.js     points
lib/words.js       word lists + aliases
lib/ratelimit.js   per-IP limiter
public/            index.html (Aero design system + CSS), app.js (UI + avatar maker), avatar.js (avatar renderer + schema), favicon.svg
scripts/           unit.js, e2e.js (full game with simulated players), bot.js (dev helper)
render.yaml        Render blueprint
```
