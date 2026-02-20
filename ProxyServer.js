const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

// How many pages of servers to fetch (100 per page)
const MAX_PAGES = 3;

app.use((req, res, next) => {
	res.header("Access-Control-Allow-Origin", "*");
	next();
});

//--------------------------------------------------
// Helper: sleep
//--------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

//--------------------------------------------------
// Fetch one page of public servers from Roblox API
//--------------------------------------------------
async function fetchServerPage(placeId, cursor = "") {
	const url =
		`https://games.roblox.com/v1/games/${placeId}/servers/Public` +
		`?sortOrder=Desc&limit=100${cursor ? `&cursor=${cursor}` : ""}`;

	const res = await fetch(url, {
		headers: {
			"Accept": "application/json",
			"User-Agent": "RobloxServerProxy/1.0",
		},
	});

	if (!res.ok) {
		throw new Error(`Roblox API returned ${res.status} for placeId ${placeId}`);
	}

	return res.json();
}

//--------------------------------------------------
// GET /servers?placeId=XXXXX&limit=30
// Returns up to `limit` servers with normalised fields
//--------------------------------------------------
app.get("/servers", async (req, res) => {
	const placeId = req.query.placeId;
	const limit   = Math.min(parseInt(req.query.limit) || 30, 100);

	if (!placeId || isNaN(Number(placeId))) {
		return res.status(400).json({ error: "Missing or invalid placeId" });
	}

	try {
		let allServers = [];
		let cursor     = "";
		let pages      = 0;

		// Paginate until we have enough or run out
		while (pages < MAX_PAGES) {
			const data = await fetchServerPage(placeId, cursor);
			const raw  = data.data || [];

			for (const s of raw) {
				// Roblox sometimes returns servers with 0 players — include them
				allServers.push({
					jobId:      s.id,
					players:    s.playing    ?? 0,
					maxPlayers: s.maxPlayers ?? 20,
					fps:        Math.round(s.fps   ?? 60),
					ping:       Math.round(s.ping  ?? 0),
				});
			}

			cursor = data.nextPageCursor;
			pages++;

			if (!cursor || allServers.length >= limit * 2) break;
			await sleep(300); // be polite to Roblox API
		}

		// Sort: best mix of populated + decent fps first so the list looks interesting
		allServers.sort((a, b) => {
			const scoreA = a.players * 10 + (a.fps > 30 ? 5 : 0);
			const scoreB = b.players * 10 + (b.fps > 30 ? 5 : 0);
			return scoreB - scoreA;
		});

		// Trim to requested limit
		const servers = allServers.slice(0, limit);

		return res.json({
			placeId,
			total:   allServers.length,
			count:   servers.length,
			servers,
		});

	} catch (err) {
		console.error(err);
		return res.status(500).json({ error: err.message });
	}
});

//--------------------------------------------------
// Health check
//--------------------------------------------------
app.get("/", (req, res) => {
	res.json({ status: "ok", message: "Roblox Server Proxy running" });
});

app.listen(PORT, () => {
	console.log(`Proxy listening on port ${PORT}`);
});
