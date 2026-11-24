# Gone Dark

A daily deduction game for Reddit. Every day a ship switches off its transponder somewhere off a real coastline. You get six sonar buoys to find it.

Each buoy hears the ship's engine as **Loud**, **Clear**, **Faint** or **Silent**, depending on how far away it is. Land blocks sound, so a buoy behind an island hears nothing. When you drop a buoy right on top of the ship, you get **Contact**.

Built on [Devvit Web](https://developers.reddit.com/) for Reddit's Game of the Day Hackathon (2026).

## How a day works

- At 00:02 UTC the app posts that day's search to the subreddit, as `Gone Dark #N · <place>`. Moderators can also post it from the subreddit menu.
- The place comes from 45 real straits, sounds and archipelagos, among them Gibraltar, Hormuz, the Øresund, Lombok, the Cook Strait and the Hebrides.
- The ship's last position and how long it has been dark mark the water it could have reached, travelling by sea and never over land.
- Difficulty follows the week: calm seas on Monday and Tuesday, rough seas at the weekend.
- Every puzzle is checked before it is posted. A solver must be able to find every possible hiding place in five buoys, so a search is never left to luck. The buoys the solver needed are shown at the end as the "expert" score.

## The community side

- Once you finish, you can see **everyone's buoys** on the chart: a heatmap of how the subreddit searched that day.
- A histogram shows how many buoys people needed, and where you stand.
- **Post my result** adds a spoiler-free comment to the post (`🔈 🔉 🔊 🎯`), and only when you press it.
- Streaks count the days in a row you find the ship. Posting your result also sets your streak as user flair in the subreddit.
- A **weekly leaderboard** for the subreddit (Redis sorted set): each ship found scores 7 minus the buoys used.
- Every night the app comments a **recap** of yesterday's search on yesterday's post: how many searched, how many found it, and where the expert's buoys went.
- A **Join** button subscribes you to the subreddit, so tomorrow's ship lands in your feed.

## Develop

Requires Node 24.18 or newer.

```bash
npm install
npm run test:unit      # game rules
npm run dev:local      # play in a plain browser against a local mock: http://localhost:5199/game.html?day=3&crowd=1
npm run dev            # playtest on Reddit (needs `npm run login` first)
npm run deploy         # type check, lint, upload
```

`npm run build:regions` rebuilds `src/server/data/regions.json` from Natural Earth. Download `ne_10m_land.geojson` and `ne_10m_minor_islands.geojson` into `.geodata/` first.

## Layout

```
src/shared/engine.ts     rules: bands, line of sight, reach by sea, solver, daily puzzle
src/server/core/game.ts  Redis state, daily posts, streaks, comments
src/client/game.tsx      the search (expanded view)
src/client/splash.tsx    the card in the feed (inline view)
src/client/chart.tsx     the SVG chart
scripts/                 region list and grid builder
tests/                   node:test suite
```

## Credits

Coastlines: [Natural Earth](https://www.naturalearthdata.com/), public domain.
