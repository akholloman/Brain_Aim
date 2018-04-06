// DOM Elements / Canvas
const container = document.getElementById("croquis-container");
const pointer = document.getElementById("pointer");
const pimg = document.getElementById("progress-image");

// Constants
const progress_loop_ms = 5 * 1000;
const MSPF = (1.0 / 30.0) * 1000; // Milliseconds per Frame (30 fps)
const MOVE_FACTOR = 5;
const NOISE_FACTOR = 3;
const GAME_TIME_MS = 3 * 60 * 1000;

// Art library
var croquis = new Croquis();
container.appendChild(croquis.getDOMElement());

// Color thief
var color_thief = new ColorThief();

// Brush
var brush = new Croquis.Brush();
brush.setSize(10);

// Sockets
var socket = io();

// Player mechanics
var position = {x: 0, y: 0};
var pressed = {};
var colors = null;
var wave = null;
var upload = false;

// Key handlers for brush movement
var handler = function (event) {
	if (event && event.code && event.code.match("Arrow")) {
		pressed[event.code] = (event.type === "keydown");

		// Stop the keys from propegating
		event.preventDefault();
	}
};

// Button Events
document.getElementById("ready-button").onclick = function () {
	socket.emit("ready");
	this.setAttribute("disabled", true);
	this.innerText = "Waiting for other players...";
};

// Socket Events
// Socket: new-player
// Fired when a new client connects to the server
// Adds a new selectable item to the character selection modal
socket.on("player", function (player) {
	var template = document.getElementById("player-template");
	var clone = document.importNode(template.content, true);
	clone.children[0].childNodes[0].data = player.name;
	clone.children[0].id = player.id;

	if (player.id === socket.id) {
		clone.children[0].classList.add("active");
	}

	document.getElementById("players").appendChild(clone);
});

// Socket: players
// Fired when the client connects for the first time
// Bulk adds all of the available BCI devices to the character selection modal
socket.on("players", function (players) {
	for (var key in players) {
		if (players.hasOwnProperty(key)) {
			var player = players[key];
			var template = document.getElementById("player-template");
			var clone = document.importNode(template.content, true);
			clone.children[0].childNodes[0].data = player.name;
			clone.children[0].id = player.id;

			if (player.ready) {
				clone.children[0].children[0].style = "";
			}

			document.getElementById("players").appendChild(clone);
		}
	}
});

socket.on("player-disconnect", function (data) {
	var del = document.getElementById(data.id);
	document.getElementById("players").removeChild(del);
});

socket.on("ready", function (id) {
	document.getElementById(id).getElementsByTagName("span")[0].style = "";
});

socket.on("color", function (data) {
	if (data.id === socket.id) {
		colors = data.colors;
		console.log(colors[0]._rgb);
	}
});

socket.on("uploader", function () {
	upload = true;
});

socket.on("error", function () {
	window.location.replace(window.location.origin + "/error/Player disconnected unexpectedly");
});

// Socket: restart
// Fired when the server restarts the game
// Redirects to the gallery entry with the image
socket.on("restart", code => {
	// Kill the loops
	clearInterval(loopHandler);
	clearInterval(progressHandler);

	if (upload) {
		console.log("UPLOADING");
		var stream = ss.createStream();

		ss(socket).emit("gif-frame", stream);
		stream.write(croquis.getLayerCanvas(0).toDataURL());
	}

	window.location.replace(window.location.origin + "/gallery/" + code + ".gif");
});

// Socket: start
// Fired when the server has verified that all clients are connected and ready
// Begins the game by closing the character selection modal and starting the progress monitoring
//   loop which determines the dominant color in the canvas
var progressHandler = null;
var loopHandler = null;
socket.on("start", () => {
	console.log("START");
	// Hide the player dialog
	document.getElementById("gameLobby").style = "display: none;";

	// Show the game mechanics
	document.getElementById("gameRunning").style = "";

	// Setup the canvas
	croquis.setCanvasSize(container.clientWidth, container.clientHeight);
	croquis.addLayer();
	croquis.fillLayer("#fff");
	brush.setImage(document.getElementById("brush"));
	croquis.setTool(brush);

	// Capture user input
	document.onkeydown = handler;
	document.onkeyup   = handler;

	loopHandler = setInterval(loop, MSPF);

	progressHandler = setInterval(function () {
		pimg.setAttribute("src", croquis.getLayerCanvas(0).toDataURL());

		var colors = color_thief.getColor(pimg);
		document.body.style.background = "#" + colors.map(x => x.toString(16)).reduce((acc, cur) => acc + cur);

		if (upload) {
			console.log("UPLOADING");
			var stream = ss.createStream();

			ss(socket).emit("gif-frame", stream);
			stream.write(croquis.getLayerCanvas(0).toDataURL());
		}
	}, progress_loop_ms);
});

// Socket: position
// Fired when the server has updated the position & brush properties of one of the clients
// Draws the changes made by the client moving. If the new position is from the currently connected
//   client, this will also move the pointer to the new position
socket.on("position", (options) => {
	var old = options.position.old;
	var cur = options.position.cur;

    // Update cursor if position belongs to the client
    if (options.id === socket.id) {
        pointer.style.top  = "" + (cur.y - 17) + "px";
        pointer.style.left = "" + (cur.x - 10) + "px";
    }
	
	// Update the brush for the player
	brush.setSize(options.brush.size);
	brush.setColor(options.brush.color);
	
	// Draw the trail
	croquis.down(old.x, old.y);
	croquis.up(cur.x, cur.y);
});

// Socket: update-time
// Fired when the server has had a second pass
// Updates the visual timer to indicate how much drawing time is left
socket.on("update-time", (time_s) => {
	var min = Math.floor(time_s / 60);
	var sec = time_s - 60 * min;

	// Make sure both the minutes and seconds left are 2 characters wide
	min = ("0" + min).slice(-2);
	sec = ("0" + sec).slice(-2);

	document.getElementById("progress-timer").innerHTML = min + ":" + sec;
});

// Main Game loop
var loop = function () {
	let old = Object.assign({}, position);

	let delta = {x: 0, y: 0};
	for (let code in pressed) {
		delta.y += (code.match("Down") && pressed[code] ? MOVE_FACTOR : 0) +
			(code.match("Up") && pressed[code] ? -MOVE_FACTOR : 0);
		delta.x += (code.match("Right") && pressed[code] ? MOVE_FACTOR : 0) +
			(code.match("Left") && pressed[code] ? -MOVE_FACTOR : 0);
	}

	delta = normalize(delta, MOVE_FACTOR);
	position.x = clamp(delta.x + position.x, -1, container.clientWidth);
	position.y = clamp(delta.y + position.y, -1, container.clientHeight);

	// Only broadcast position when it has moved
	if (old.x !== position.x || old.y !== position.y) {
		// Remaps a value into the range [0, 1] given its min and max
		let remap = (x) => (x.value - x.min) / (x.max - x.min);

		// Wave percentages
		let ap = 0.5; //remap(waves.alpha);
		let bp = 0.5; //0.5 - remap(waves.beta);

		// Add random jitter to the movement
		let n = noise(1 - ap, NOISE_FACTOR);
		position.x += n.x;
		position.y += n.y;

		socket.emit("position", {
			id: socket.id,
			position: {
				old: old,
				cur: position
			},
			brush: {
				color: chroma.mix(colors[0]._rgb, colors[1]._rgb, bp).hex(),
				// TODO: Change this to be factored by the ratio of the clientWidth
				size: 45 * (0.25 + 1.5 * ap) // Adjust the range from [0, 1] -> [0.25, 1.75]
			}
		});
	}
};

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

// Saves a URI as the provided filename
// Source: https://stackoverflow.com/a/26361461
function saveAs(uri, filename) {
	var link = document.createElement('a');
	if (typeof link.download === 'string') {
		document.body.appendChild(link); // Firefox requires the link to be in the body
		link.download = filename;
		link.href = uri;
		link.click();
		document.body.removeChild(link); // remove the link when done
	} else {
		location.replace(uri);
	}
}