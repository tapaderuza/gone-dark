# Gone Dark

A daily deduction game for Reddit. Every day a ship switches off its transponder somewhere off a real coastline. You get six sonar buoys to find it.

Each buoy hears the ship's engine as **Loud**, **Clear**, **Faint** or **Silent**, depending on how far away it is. Land blocks sound, so a buoy behind an island hears nothing. When you drop a buoy right on top of the ship, you get **Contact**.

Built on [Devvit Web](https://developers.reddit.com/) for Reddit's Game of the Day Hackathon (2026).

App page: [developers.reddit.com/apps/gone-dark-daily](https://developers.reddit.com/apps/gone-dark-daily)

## How to play

1. Open today's post (`Gone Dark #N · <place>`) and press **Start the search**.
2. The lit water on the chart is everywhere the ship could have reached since it went dark.
3. Tap a lit square, then **Drop buoy**. The buoy reports what it hears:
   - **Contact**: the ship is right there. You found it.
   - **Loud**, **Clear** or **Faint**: the ship is near, middling or far (the distances in km are shown for that map).
   - **Silent**: the ship is far away, or an island blocks the sound.
4. Squares that no longer fit every reading go dark. Use the six buoys to narrow it down to one square and drop on it.
5. When you finish, see where everyone else dropped their buoys, how many buoys people needed, and this week's leaderboard. **Post my result** adds a spoiler-free comment and shows your streak as flair.

A new ship goes dark every day at 00:02 UTC. Every puzzle can be solved in five buoys or fewer.

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
