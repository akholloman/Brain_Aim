// System level includes
const path = require("path");
const config = require("./config.js");
const fs = require("fs");
const stream = require("stream");

// HTTP Includes
const express = require("express");
const app = express();
const server = require("http").Server(app);
const io = require("socket.io")(server);
const ss = require("socket.io-stream");
const pug = require("pug");

// Unique ID / name library
const hat = require("hat");
const moniker = require("moniker");

// GIF maker
const PNG = require('pngjs').PNG;
const GIFEncoder = require('gifencoder');
let encoders = {};

// Create OSC server for handling data from MUSE
// let waves = {};
// let osc_server = new osc.Server(config.MUSE.PORT, config.MUSE.HOST);
// osc_server.on("message", (msg, rinfo) => {
// 	// See if the message contains one of the two requested brain waveforms
// 	let descriptors = msg.shift().split("/");
// 	let name = descriptors[0];
// 	let type = (descriptors.length > 2 ? descriptors[2].match(/(alpha|beta)/i) : null);

// 	if (type) {
// 		let defined = msg.filter(x => x !== NaN);
// 		if (!waves[name]) {
// 			waves[name] = {};
// 			io.emit("new-player", name);
// 		}
		
// 		// Save the average
// 		if (!waves[name][type[1]]) waves[name][type[1]] = {min: 1, max: 0, value: 0};
// 		waves[name][type[1]].value = defined.reduce((acc, cur) => acc + cur) / defined.length;

// 		// Save the range
// 		if (waves[name][type[1]].value > waves[name][type[1]].max)
// 			waves[name][type[1]].max = waves[name][type[1]].value;
// 		if (waves[name][type[1]].value < waves[name][type[1]].min)
// 			waves[name][type[1]].min = waves[name][type[1]].value;
// 	}
// });

// Distinct Colors
let dc = require("distinct-colors");
let chroma = require("chroma-js");
let palette = null;

// Constants
const GAME_TIME_MS = 20 * 1000;//3 * 60 * 1000;

// Mechanic Maps
let clients = {};
let bounds = {x: null, y: null};
let loopHandler = null;
let timeHandler = null;
let time_elapsed = 0;

// Express config routes
app.set("view engine", "pug");
app.use(express.static("public"));
app.get("/", (req, res) => {
	res.render("index", {title: "NeuroBrush"});
});

// Game Paths
app.get("/new", (req, res) => {
	let uuid = hat();
	clients[uuid] = {uuid: uuid, players: {}, ready: 0, running: false};

	res.redirect("/game/" + uuid);
});
app.get("/game/:id", (req, res) => {
	if (!req.params.id || !clients[req.params.id]) {
		return res.status(400).render("error", {title: "NeuroBrush", errorCode: 400, errorMsg: "Game with specified ID not found"});
	}

	if (clients[req.params.id].running) {
		return res.render("spectator", {title: "NeuroBrush"});
	}

	res.render("game", {title: "NeuroBrush"});
});
app.get("/waves", (req, res) => {
	res.json(waves);
});

// Gallery
app.get("/gallery", (req, res) => {
	const gallery = path.join(__dirname, "public", "image", "gallery");

	fs.readdir(gallery, (err, files) => {
		files = files.filter(x => x.includes(".gif"));
		res.render("gallery", {title: "NeuroBrush", paths: files});
	});
});
app.get("/gallery/:id", (req, res) => {
	const gallery = path.join(__dirname, "public", "image", "gallery");

	fs.readdir(gallery, (err, files) => {
		files = files.filter(x => x.includes(".gif"));
		if (!req.params.id || files.indexOf(req.params.id) < 0) {
			return res.status(400).render("error", {title: "NeuroBrush", errorCode: 400, errorMsg: "Image with specified ID not found"});
		}
	
		res.render("image", {title: "NeuroBrush", path: req.params.id});
	});
});

// Catch-All 404 case
app.use("/error/:message", (req, res) => {
	res.render("error", {title: "NeuroBrush", errorCode: 501, errorMsg: req.params.message});
});
app.use((req, res) => {
	res.status(404).render("error", {title: "NeuroBrush", errorCode: 404, errorMsg: "Page not found"});
});

io.on("connection", (client) => {
	console.log("Connected");
	// Connect the client to a room specifically for their game
	let uuid = client.handshake.headers.referer.split('/');
	uuid = uuid[uuid.length - 1];
	client.join(uuid);

	// Get client name
	let player = moniker.choose();
	io.to(uuid).emit("player", {id: client.id, name: player});
	client.emit("players", clients[uuid].players);
	clients[uuid].players[client.id] = {id: client.id, name: player, ready: false};

	client.on("ready", () => {
		clients[uuid].players[client.id].ready = true;
		io.to(uuid).emit("ready", client.id);
		clients[uuid].ready += 1;

		// If everyone is ready
		if (Object.keys(clients[uuid].players).length == clients[uuid].ready) {
			// Designate one of the clients to be the uploader for the gif
			if (!clients[uuid].running) {
				client.emit("uploader");
				clients[uuid].running = true;

				// Initialize a GIF for the game
				encoders[uuid] = new GIFEncoder(1024, 480);
				encoders[uuid].createReadStream()
					.pipe(fs.createWriteStream(
						path.join(__dirname, "public", "image", "gallery", uuid + ".gif"))
					);
				encoders[uuid].start();
				encoders[uuid].setRepeat(0);   // 0 for repeat, -1 for no-repeat
				encoders[uuid].setDelay(500);  // frame delay in ms
				encoders[uuid].setQuality(10); // image quality. 10 is default.
			}

			// Send each client their color
			palette = dc(clients[uuid].ready * 2);
			for (var key in clients[uuid].players) {
				if (clients[uuid].players.hasOwnProperty(key)) {
					io.to(uuid).emit("color", {
						id: clients[uuid].players[key].id, 
						colors: [palette.pop(), palette.pop()]
					});
				}
			}

			// Tell the clients to start playing
			io.to(uuid).emit("start");

			// Inform the clients every second of how much time is left
			time_elapsed = 0;
			timeHandler = setInterval(() => {
				io.to(uuid).emit("update-time", GAME_TIME_MS / 1000 - time_elapsed);
				++time_elapsed;
			}, 1000);

			// Get ready to restart after GAME_TIME_MS
			setTimeout(() => {
				clearInterval(timeHandler);
				encoders[uuid].finish();
				delete encoders[uuid];
				io.to(uuid).emit("restart", uuid);

				delete clients[uuid];
			}, GAME_TIME_MS + 1000);
		}
	});

	client.on("position", data => {
		io.to(uuid).emit("position", data);
	});

	client.on("disconnect", _ => {
		if (!clients[uuid])
			return;
		
		// Error out if someone disconnects while the game is going on (but not for spectators)
		if (clients[uuid].running && clients[uuid].players[client.id].ready)
			return io.to(uuid).emit("error");

		if (clients[uuid].players[client.id].ready)
			clients[uuid].ready -= 1;

		io.to(uuid).emit("player-disconnect", {id: client.id});
		delete clients[uuid].players[client.id];
	});

	// File uploading
	ss(client).on("gif-frame", (strm, data) => {
		strm.pipe(stream.Transform({
			transform(chunk, enc, next) {
				var base64Data = chunk.toString().replace(/^data:image\/png;base64,/, "");
				this.push(new Buffer(base64Data, 'base64'));
			}
		}))
		.pipe(new PNG({
			filterType: 4
		})).on("parsed", (data) => {
			encoders[uuid].addFrame(data);
		});
	});
});

server.listen(config.WEB.PORT, config.WEB.HOST, () => {
	console.log("Server is listening on: " + config.WEB.HOST + ":" + config.WEB.PORT);
});