// MUSE Includes
let osc = require("node-osc");
let path = require("path");
let config = require("./config.js");

// HTTP Includes
let http = require("http");
let pug = require("pug");

// Create OSC server for handling data from MUSE
let osc_server = new osc.Server(config.MUSE.PORT, config.MUSE.HOST);
osc_server.on("message", (msg, rinfo) => {
	if (!msg[0].match("alpha")) return;

	console.log(msg);
});

// Create HTTP Server
const server = http.createServer((req, res) => {
	res.end(pug.renderFile("index.pug", {
		title: "Brain Aim"
	}));
});

server.listen(config.WEB.PORT, config.WEB.HOST, () => {
	console.log("Server is listening on: " + config.WEB.HOST + ":" + config.WEB.PORT);
});