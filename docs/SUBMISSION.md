# Gone Dark — Devpost submission (draft, English)

Review and rewrite anything in your own words before you paste it. The rules ask for your own ideas and creativity.

## Links to fill in

- App listing: `https://developers.reddit.com/apps/<app-name>`
- Demo post: `https://www.reddit.com/r/<your-subreddit>/comments/<post-id>/`
- Code (optional): `https://github.com/<you>/gone-dark`
- Video (optional, under 1 minute): YouTube link

## Tagline

A ship went dark off a real coastline. Six sonar buoys. One search a day, together.

## Inspiration

Ships really do "go dark": they switch off their AIS transponder, and someone has to work out where they went from a last fix, a top speed and whatever sensors can hear. I wanted the feeling of that search in a two-minute daily puzzle. That means real coastlines, real distances, and the rule that land blocks sound, so geography actually matters.

## What it does

- Every day at 00:02 UTC a new post appears: `Gone Dark #N · Strait of Gibraltar` (or one of 45 real straits, sounds and archipelagos).
- The ship's last fix and how long it has been dark light up the water it could have reached, by sea only.
- Tap a square and drop a buoy. It hears the engine as Loud, Clear, Faint or Silent, with the distance in km for that map. Squares that no longer fit the readings are ruled out on the chart.
- Land blocks sound: a buoy behind an island hears Silent. That makes straits and islands part of the logic.
- Six buoys. Drop one right on the ship for Contact.
- When you finish, you see where the whole subreddit dropped its buoys (a heatmap), a histogram of how many buoys everyone needed, your streak, and the expert solver's count for that day.
- "Post my result" adds a spoiler-free comment (`🔈 🔉 🔊 🎯`), only when you press it.

## How I built it

- Devvit Web: React 19 and Tailwind in two entry points. One is an inline card in the feed and the other is the expanded search. The server runs on Hono, with Redis for state.
- Natural Earth 1:10m coastlines (public domain) are turned into 12×16 grids by a build script: polygon clipping, point-in-polygon sampling, Douglas–Peucker simplification.
- The rules live in one pure TypeScript module that the server and the client share:
  - distance bands;
  - line of sight across the grid;
  - reach by sea, with Dijkstra and no squeezing between land cells;
  - a greedy expert solver that picks the buoy leaving the fewest possible squares.
- Puzzles are deterministic per day and checked for fairness before posting: the solver must find every possible hiding place within five buoys.
- The ship's position never reaches the client until you finish, and the server judges every buoy.
- A scheduler task posts each day; the app also posts on install, and moderators have a menu item to post.

## Challenges

- Making geography matter without making it unfair. Line of sight plus "reach by sea" gave the coastlines a real role, and the solver check keeps every day solvable.
- Real data is messy: closed polygon rings, tiny islets and lakes. The grid builder keeps only the largest connected stretch of sea as playable water.

## What's next

- A weekly "fleet" leaderboard per subreddit and flair for long streaks.
- Optional harder modes: a moving ship, and fog that shortens buoy range.

## Testing instructions for judges

Open the demo post and press "Start the search". A short card explains the rules. Tap any lit square, then "Drop buoy". The panel tells you what the buoy heard and how many squares still fit. To see the community view, finish a search; the heatmap button is on the result card.

## Video script (≤ 60 s)

1. 0–5 s: the feed card with its sonar pulse. On screen: "A ship just went dark."
2. 5–15 s: open the search. The lit water and the last fix. "It can only be somewhere it could sail to."
3. 15–35 s: drop three buoys: Faint, Loud, Silent behind an island. The ruled-out squares hatch over. "Land blocks sound."
4. 35–45 s: Contact. The ship appears.
5. 45–55 s: the result card, then "Everyone's buoys": the subreddit's heatmap. "Every day, a new ship. Search it together."
6. 55–60 s: title card, "Gone Dark · daily on Reddit".
