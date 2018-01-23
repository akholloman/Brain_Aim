// MUSE Includes
let osc = require("node-osc");
let path = require("path");
let config = require("./config.js");

// HTTP Includes
let express = require("express");
let app = express();
let server = require("http").Server(app);
let io = require("socket.io")(server);
let pug = require("pug");

// Create OSC server for handling data from MUSE
let waves = {};
let osc_server = new osc.Server(config.MUSE.PORT, config.MUSE.HOST);
osc_server.on("message", (msg, rinfo) => {
	// See if the message contains one of the two requested brain waveforms
	let descriptors = msg.shift().split("/");
	let name = descriptors[0];
	let type = (descriptors.length > 2 ? descriptors[2].match(/(alpha|beta)/i) : null);

	if (type) {
		let defined = msg.filter(x => x !== NaN);
		if (!waves[name]) {
			waves[name] = {};
			io.emit("new-player", name);
		}
		
		// Save the average
		if (!waves[name][type[1]]) waves[name][type[1]] = {min: 1, max: 0, value: 0};
		waves[name][type[1]].value = defined.reduce((acc, cur) => acc + cur) / defined.length;

		// Save the range
		if (waves[name][type[1]].value > waves[name][type[1]].max)
			waves[name][type[1]].max = waves[name][type[1]].value;
		if (waves[name][type[1]].value < waves[name][type[1]].min)
			waves[name][type[1]].min = waves[name][type[1]].value;
	}
});

// Distinct Colors
let dc = require("distinct-colors");
let chroma = require("chroma-js");
let palette = null;

// Constants
const MSPF = (1.0 / 30.0) * 1000; // Microseconds per Frame (30 fps)
const MOVE_FACTOR = 5;
const NOISE_FACTOR = 3;
const GAME_TIME_MS = 3 * 60 * 1000;

// express config routes
app.set("view engine", "pug");
app.use(express.static("public"));
app.get("/", (req, res) => {
	res.render("index", {title: "Brain Aim"});
});
app.get("/waves", (req, res) => {
	res.json(waves);
});

// Mechanic Maps
let clients = {};
let bounds = {x: null, y: null};
let loopHandler = null;
let timeHandler = null;
let time_elapsed = 0;

io.on("connection", (client) => {
	console.log("Connected");
	let players = Object.keys(waves).map((x) => {
		return {name: x, taken: (waves[x].client !== undefined)}
	});
	client.emit("players", players);

	client.position = {x: 0, y: 0};
	client.pressed = {};
	clients[client.id] = client;

	client.on("select-player", (name) => {
		// First, make sure that the name is valid
		if (!waves[name]) return;

		// Make sure that name isn't being used already
		if (waves[name].client) return;

		// Inform players of the chosen name
		waves[name].client = client;
		client.player = name;
		io.emit("player-selected", {id: client.id, name: name});

		// Short circuit if there are still players without a name
		for (const id of Object.keys(clients)) {
			if (!clients[id].player)
				return;
		}

		// Start the game
		loopHandler = setInterval(loop, MSPF);
		palette = dc(Object.keys(clients) * 2);

		// Inform the clients that the game has started
		io.emit("start", null);

		// Inform the clients every second of how much time is left
		time_elapsed = 0;
		timeHandler = setInterval(() => {
			io.emit("update-time", GAME_TIME_MS / 1000 - time_elapsed);
			++time_elapsed;
		}, 1000);

		// Get ready to restart after GAME_TIME_MS
		setTimeout(() => {
			clearInterval(loopHandler);
			clearInterval(timeHandler);
			io.emit("restart", null);

			// Reset client properties
			for (const id of Object.keys(clients)) {
				clients[id].position = {x: 0, y: 0};
				waves[clients[id].player].client = null;
				
				clients[id].player  = null;
				clients[id].pressed = {};
			}
		}, GAME_TIME_MS);
	});

	client.on("bounds" , (b) => {
		bounds.x = b.x;
		bounds.y = b.y;
	});

	client.on("key", (event) => {
		if (!event || !event.code || !event.code.match("Arrow")) return;
		client.pressed[event.code] = (event.type === "keydown");
	});

	client.on("disconnect", (_) => {
		delete clients[client.id];
	});
});

// Game Loop
let loop = () => {
	for (let id in clients) {
		let client = clients[id];
		let old = Object.assign({}, client.position);

		if (!client.color) {
			client.color = {
				from: palette.pop().rgb(),
				to: palette.pop().rgb()
			};
		}

		let delta = {x: 0, y: 0};
		for (let code in client.pressed) {
			delta.y += (code.match("Down") && client.pressed[code] ? MOVE_FACTOR : 0) +
				(code.match("Up") && client.pressed[code] ? -MOVE_FACTOR : 0);
			delta.x += (code.match("Right") && client.pressed[code] ? MOVE_FACTOR : 0) +
				(code.match("Left") && client.pressed[code] ? -MOVE_FACTOR : 0);
		}

		delta = normalize(delta, MOVE_FACTOR);
		client.position.x = clamp(delta.x + client.position.x, -1, bounds.x);
		client.position.y = clamp(delta.y + client.position.y, -1, bounds.y);

		// Only broadcast position when it has moved
		if (old.x !== client.position.x || old.y !== client.position.y) {
			// Remaps a value into the range [0, 1] given its min and max
			let remap = (x) => (x.value - x.min) / (x.max - x.min);

			// Wave percentages
			let w = waves[client.player];
			let ap = remap(w.alpha);
			let bp = 0.5 - remap(w.beta);

			// Add random jitter to the movement
			let n = noise(1 - ap, NOISE_FACTOR);
			client.position.x += n.x;
			client.position.y += n.y;

			io.emit("position", {
				id: client.id,
				position: {
					old: old,
					cur: client.position
				},
				brush: {
					color: chroma.mix(client.color.from, client.color.to, bp).hex(),
					size: 45 * (0.25 + 1.5 * ap) // Adjust the range from [0, 1] -> [0.25, 1.75]
				}
			});
		}
	}
};

server.listen(config.WEB.PORT, config.WEB.HOST, () => {
	console.log("Server is listening on: " + config.WEB.HOST + ":" + config.WEB.PORT);
});

// Helper methods
function clamp(value, minimum, maximum) {
	if (minimum !== undefined && value < minimum) return minimum;
	if (maximum !== undefined && value > maximum) return maximum;

	return value;
}

// Given a 2D vector v and a magnitude n,
// returns a vector with the same direction as v
// but with a magnitude of n
function normalize(v, n) {
	let res = Object.assign({}, v);
	let len = Math.hypot(res.x, res.y);
	let mag = n || 1;

	if (len) {
		res.x = res.x / len * mag;
		res.y = res.y / len * mag;
	}

	return res;
}

// Given a percentage p, returns a vector with amplitude n * p and a random direction
function noise(p, n) {
	let xn = Math.random() - 0.5;
	let yn = Math.random() - 0.5;

	return normalize({x: xn, y: yn}, p * n);
}