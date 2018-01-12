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
	if (!msg[0].match("alpha")) return;

	console.log(msg);
});

// express config routes
app.set("view engine", "pug");
app.use(express.static("public"));
app.get("/", (req, res) => {
	res.render("index", {title: "Brain Aim"});
});

//Display through socket
let clients = {};

io.on("connection", (client) => {
	console.log("Connected");
	
	client.on("arrows", (pressed) => {
		//to do
	});
});

server.listen(config.WEB.PORT, config.WEB.HOST, () => {
	console.log("Server is listening on: " + config.WEB.HOST + ":" + config.WEB.PORT);
});