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
// modal.show();

// Socket Events
let queue = [];
socket.on("position", (options) => {
    // Update cursor if position belongs to the client
    if (options.id === socket.id) {
        pointer.style.top  = "" + (options.nposition.y - 17) + "px";
        pointer.style.left = "" + (options.nposition.x - 10) + "px";
    }
    
    brush.setColor(options.color);
    croquis.down(options.oposition.x, options.oposition.y);
    croquis.up(options.nposition.x, options.nposition.y);
});

socket.on("progress", (percentage) => {
    console.log(data);
});

socket.on("brush", (brush) => {
    console.log(data);
});