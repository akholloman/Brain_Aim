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
let osc_server = new osc.Server(config.MUSE.PORT, config.MUSE.HOST);
osc_server.on("message", (msg, rinfo) => {
	if (!msg[0].match("beta")) return;

	console.log(msg);
});

// Distinct Colors
let dc = require("distinct-colors");
let palette = dc(4).map(x => x.hex()); // TODO

// Constants
const MSPF = 10; // Microseconds per Frame
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

io.on("connection", (client) => {
	console.log("Connected");
	io.emit("new_player", client.id);
	client.position = {x: 0, y: 0};
	client.pressed = {};
	client.color = palette.pop();
	clients[client.id] = client;

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
let loop = setInterval(() => {
	for (let id in clients) {
		let client = clients[id];
		let old = client.position;

		for (let code in client.pressed) {
			client.position.y += (code.match("Down") && client.pressed[code] ? MOVE_FACTOR : 0) + 
				(code.match("Up") && client.pressed[code] ? -MOVE_FACTOR : 0);
			client.position.x += (code.match("Right") && client.pressed[code] ? MOVE_FACTOR : 0) + 
				(code.match("Left") && client.pressed[code] ? -MOVE_FACTOR : 0);
		}

		client.position.x = clamp(client.position.x, -1, bounds.x);
		client.position.y = clamp(client.position.y, -1, bounds.y);
		io.emit("position", {id: client.id, oposition: old, nposition: client.position, color: client.color});
	}
}, MSPF);

server.listen(config.WEB.PORT, config.WEB.HOST, () => {
	console.log("Server is listening on: " + config.WEB.HOST + ":" + config.WEB.PORT);
});

// Helper methods
function clamp(value, minimum, maximum) {
	if (minimum && value < minimum) return minimum;
	if (maximum && value > maximum) return maximum;

	return value;
}