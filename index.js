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
		waves[name][type[1]] = defined.reduce((acc, cur) => acc + cur) / defined.length;
	}
});

// Distinct Colors
let dc = require("distinct-colors");
let chroma = require("chroma-js");
let palette = null;

// Constants
const MSPF = (1.0 / 30.0) * 1000; // Microseconds per Frame (30 fps)
const MOVE_FACTOR = 5;
const GAME_TIME_MS = 3 * 60 * 1000;

// express config routes
app.set("view engine", "pug");
app.use(express.static("public"));
app.get("/", (req, res) => {
	res.render("index", {title: "Brain Aim"});
});

// Mechanic Maps
let clients = {};
let bounds = {x: null, y: null};
let loopHandler = null;

io.on("connection", (client) => {
	console.log("Connected");
	client.emit("players", Object.keys(waves));

	client.position = {x: 0, y: 0};
	client.pressed = {};
	clients[client.id] = client;

	client.on("select-player", (name) => {
		// First, make sure that the name is valid
		if (!waves[name]) return;

		client.player = name;

		// Short circuit if there are still players without a name
		for (const id of Object.keys(clients)) {
			if (!clients[id].player)
				return;
		}

		loopHandler = setInterval(loop, MSPF);
		palette = dc(Object.keys(clients) * 2);

		io.emit("start", null);
		setTimeout(() => {
			clearInterval(loopHandler);
			io.emit("restart", null);

			// Reset client positions
			for (const id of Object.keys(clients)) {
				clients[id].position = {x: 0, y: 0};
			}

			// TODO: Implement reset
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
			// Beta percentage
			let bp = clamp(1 - 10 * waves[client.player].alpha, 0, 1);

			io.emit("position", {
				id: client.id,
				position: {
					old: old,
					cur: client.position
				},
				brush: {
					color: chroma.mix(client.color.from, client.color.to, bp).hex(),
					size: 15 * (0.5 + 15 * waves[client.player].beta)
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
	if (minimum && value < minimum) return minimum;
	if (maximum && value > maximum) return maximum;

	return value;
}

// Given a 2D vector v and a magnitude n,
// returns a vector with the same direction as v
// but with a magnitude of n
function normalize(v, n) {
	let res = Object.assign({}, v);
	let len = Math.hypot(res.x, res.y);
	
	if (len > n) {
		res.x = res.x / len * n;
		res.y = res.y / len * n;
	}

	return res;
}