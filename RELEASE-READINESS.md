# Song Sense: release readiness

Status: **playable and tested locally; not deployed, not pushed.** Nothing has been published anywhere.

## Verified
* `npm test`: 30 unit tests (matching, scoring, word lists) and 81 end-to-end checks. The e2e script starts a real server and plays a whole 5-player game with simulated players: lobby and settings validation, word choice, hidden-word guarantees (the word never appears in a guesser's payload), 1 to 3 songs, fuzzy/plural/alias guesses, wrong guesses visible, correct guesses hidden, private post-solve chat, speed- and song-based scoring, early finish, auto word pick, no-song and timeout rounds, picker leaving mid-round, host handover, latecomers, final leaderboard, play again, malformed/oversized input and rate limits.
* Real browser run (desktop and 375 px phone): invite link, join, reconnect after refresh, picker word choice, paste-a-link song adds with real Spotify embeds (Yellow, Knights of Cydonia), typed guesses (typo accepted, "So close" path, cooldown), results screen, final leaderboard. Bugs found and fixed during the run: invite check re-rendered the join form while typing, pasted-link box kept its text after a successful add, message box was below the fold on phones (now pinned to the bottom).
* Not covered by a browser run: in-app Spotify **search** (no keys were available locally; the endpoint returns 501 and the UI falls back to paste-a-link, which is tested). Test search after adding keys on Render.

## Open decisions (yours)
1. **Synonyms.** Currently a hand-written alias list per word (for example angry also accepts "anger" and "mad"). Unlisted synonyms count as wrong. Say if you want it looser or stricter, or a "host can accept a guess" button.
2. **Domain.** songsense.io vs aux.io: you register it (see README for the Render connection steps).
3. **Moderation.** No kick/ban or profanity filter yet. Fine for friends; add before sharing publicly.

## Remaining blockers / risks before a public launch
* **Spotify Development Mode**: API (search) only works for the app owner (needs Premium) and allowlisted users, capped at a handful. Everyone else must paste links until you request extended access from Spotify. The game works either way.
* **Single instance, in-memory rooms**: a deploy or restart ends all live games. Use the Starter plan (not free, which sleeps).
* **No persistence or analytics** by design; update the privacy notice if you add any.
* Org policy: repo must be **private**; Spotify keys only in Render's Environment tab (the Score It keys are not shared with a new service). The key you pasted in chat earlier must be treated as exposed: rotate it in the Spotify dashboard and never paste keys into chat again.
* Short room codes (4 letters) are guessable; rooms hold no private data and joins are rate limited.

## Exact deploy steps
1. Tell me to create the private GitHub repo and push (I have not done this), or do it yourself: create a **private** repo `song-sense`, then `git remote add origin <url>` and `git push -u origin main`.
2. Render dashboard > **New + > Blueprint** > select the repo > apply (`render.yaml`: service `song-sense`, Starter, 1 instance, health check `/healthz`).
3. Service > **Environment** > add `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` (type them in Render only) > Save.
4. Open `https://<service>.onrender.com`, create a game, join from a phone, play a round. Confirm search works for an allowlisted account.
5. Domain: register songsense.io or aux.io, then Render > Settings > Custom Domains and follow the DNS records Render displays (README has details). Wait for the certificate.
