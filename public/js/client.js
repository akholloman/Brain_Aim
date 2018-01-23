// DOM Elements / Canvas
var container = document.getElementById("croquis-container");
var pointer = document.getElementById("pointer");
var pbar = document.getElementById("progress-bar");
var pimg = document.getElementById("progress-image");

// Constants
const width = container.clientWidth;
const height = 500;
const progress_loop_ms = 15 * 1000;

// Art library
var croquis = new Croquis();
container.appendChild(croquis.getDOMElement());
croquis.setCanvasSize(width, height);
croquis.addLayer();
croquis.fillLayer("#fff");
// FIXME: See if this is worth it
// croquis.setToolStabilizeLevel(20);
// croquis.setToolStabilizeWeight(0.5);

// Color thief
var color_thief = new ColorThief();

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

socket.on("restart", () => {
	modal.show();
	croquis.fillLayer("#fff");
	clearInterval(progressHandler);

	pointer.style.top  = "-17px";
	pointer.style.left = "-10px";
});

var progressHandler = null;
socket.on("start", () => {
	modal.unmount();

	progressHandler = setInterval(() => {
		pimg.setAttribute("src", croquis.getLayerCanvas(0).toDataURL());

		var colors = color_thief.getColor(pimg);
		pbar.style.background = "#" + colors.map(x => x.toString(16)).reduce((acc, cur) => acc + cur);
	}, progress_loop_ms);
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