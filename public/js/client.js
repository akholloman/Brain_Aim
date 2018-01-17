// DOM Elements / Canvas
var container = document.getElementById("croquis-container");
var pointer = document.getElementById("pointer");
const width = container.clientWidth;
const height = 500;

// Art library
var croquis = new Croquis();
container.appendChild(croquis.getDOMElement());
croquis.setCanvasSize(width, height);
croquis.addLayer();
croquis.fillLayer("#fff");
// FIXME: See if this is worth it
// croquis.setToolStabilizeLevel(20);
// croquis.setToolStabilizeWeight(0.5);

// Brush
var brush = new Croquis.Brush();
brush.setSize(10);
croquis.setTool(brush);

// Sockets
var socket = io();
socket.emit("bounds", {x: width, y: height});

// Key handlers for brush
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
let players = [];
socket.on("new-player", (name) => {
	addPlayer(name);
});

socket.on("players", (players) => {
	players.forEach((player) => {
		addPlayer(player);
	});
});

socket.on("start", () => {
	modal.unmount();
});

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

socket.on("progress", (percentage) => {
    console.log(data);
});

// Helper methods
function addPlayer(name) {
	players.push(name);

	var btn = document.createElement("button");
	btn.innerHTML = name;
	btn.onclick = () => {
		socket.emit("select-player", name);
	};

	document.getElementById("players").appendChild(btn);
}