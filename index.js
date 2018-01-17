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

const KEY_LEFT  = 37;
const KEY_UP    = 38;
const KEY_RIGHT = 39;
const KEY_DOWN  = 40;

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

		if (Object.keys(clients).length === Object.keys(waves).length) {
			loopHandler = setInterval(loop, MSPF);
			palette = dc(Object.keys(clients) * 2);

			io.emit("start", null);
		}
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

		for (let code in client.pressed) {
			client.position.y += (code.match("Down") && client.pressed[code] ? MOVE_FACTOR : 0) +
				(code.match("Up") && client.pressed[code] ? -MOVE_FACTOR : 0);
			client.position.x += (code.match("Right") && client.pressed[code] ? MOVE_FACTOR : 0) +
				(code.match("Left") && client.pressed[code] ? -MOVE_FACTOR : 0);
		}

		client.position.x = clamp(client.position.x, -1, bounds.x);
		client.position.y = clamp(client.position.y, -1, bounds.y);

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
					size: 15 * (1 + 10 * waves[client.player].beta)
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