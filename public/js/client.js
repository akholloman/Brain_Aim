// DOM Elements / Canvas
var container = document.getElementById("croquis-container");
var pointer = document.getElementById("pointer");
var pbar = document.getElementById("progress-bar");
var pimg = document.getElementById("progress-image");

// Constants
const width = container.clientWidth;
const height = 500;
const progress_loop_ms = 5 * 1000;

// Art library
var croquis = new Croquis();
container.appendChild(croquis.getDOMElement());
croquis.setCanvasSize(width, height);
croquis.addLayer();
croquis.fillLayer("#fff");

// Color thief
var color_thief = new ColorThief();

// Brush
var brush = new Croquis.Brush();
brush.setSize(10);
brush.setImage(document.getElementById("brush"));
croquis.setTool(brush);

// Sockets
var socket = io();
socket.emit("bounds", {x: width, y: height});

// Key handlers for brush movement
var handler = (event) => {
    if (event && event.code && event.code.match("Arrow"))
        socket.emit("key", {code: event.code, type: event.type});
};
document.onkeydown = handler;
document.onkeyup   = handler;

// Selection Modal
var content = document.getElementById("selection").cloneNode(true);
content.style.display = "";
var modal = new Modal(content, true);
modal.show();

// Socket Events
// Socket: new-player
// Fired when a new client connects to the server
// Adds a new selectable item to the character selection modal
let players = [];
socket.on("new-player", (name) => {
	addPlayer(name, false);
});

// Socket: players
// Fired when the client connects for the first time
// Bulk adds all of the available BCI devices to the character selection modal
socket.on("players", (players) => {
	players.forEach((player) => {
		addPlayer(player.name, player.taken);
	});
});

// Socket: player-selected
// Fired when the server successfully selets a player for any connected client
// Either adds a strikethrough to a no longer available character or green highlights the
//   client's selected user
socket.on("player-selected", (opts) => {
	// Show feedback of the chosen user
	if (opts.id === socket.id) {
		// Make sure a name isn't already selected
		if (document.getElementsByClassName("selected")) {
			var els = document.getElementsByClassName("selected");
			for (var i = 0; i < els.length; ++i) {
				els[i].classList.remove("selected");
			}
		}

		// Select the user chosen name
		document.getElementById(opts.name).classList.add("selected");
	} else {
		var btn = document.getElementById(opts.name);
		btn.classList.add("not-selectable");
		btn.disabled = true;
	}
});

// Socket: restart
// Fired when the server restarts the game
// Resets the playing stage and renders the final image to the client in another tab
socket.on("restart", () => {
	// Present the generated image to the user
	window.open(pimg.src, "_blank");

	// Reset the stage
	var sels = document.getElementsByClassName("selected");
	var nots = document.getElementsByClassName("not-selectable");
	for (var i = 0; i < sels.length; ++i) {
		sels[i].classList.remove("selected");
	}

	for (var i = 0; i < nots.length; ++i) {
		nots[i].classList.remove("not-selectable");
	}

	modal.show();
	croquis.fillLayer("#fff");
	clearInterval(progressHandler);

	pointer.style.top  = "-17px";
	pointer.style.left = "-10px";
	document.body.style.background = "#EEEEEE";
});

// Socket: start
// Fired when the server has verified that all clients are connected and ready
// Begins the game by closing the character selection modal and starting the progress monitoring
//   loop which determines the dominant color in the canvas
var progressHandler = null;
socket.on("start", () => {
	modal.unmount();

	progressHandler = setInterval(() => {
		pimg.setAttribute("src", croquis.getLayerCanvas(0).toDataURL());

		var colors = color_thief.getColor(pimg);
		document.body.style.background = "#" + colors.map(x => x.toString(16)).reduce((acc, cur) => acc + cur);
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

// Helper methods
// Function: addPlayer
// Adds a new selectable item to the character select modal with the name `name`. If the name is
//   taken, then this will also disable the button and add a strikethrough to the button's text
function addPlayer(name, taken) {
	players.push(name);

	var btn = document.createElement("button");
	btn.setAttribute("id", name);
	btn.innerHTML = name;
	btn.onclick = () => {
		socket.emit("select-player", name);
	};

	if (taken) {
		btn.classList.add("not-selectable");
		btn.disabled = true;
	}

	document.getElementById("players").appendChild(btn);
}