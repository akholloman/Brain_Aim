// Canvas
var container = document.getElementById("croquis-container");
const width = container.clientWidth;
const height = 500;

var croquis = new Croquis();
container.appendChild(croquis.getDOMElement());
croquis.setCanvasSize(width, height);
croquis.addLayer();
croquis.fillLayer("#fff");

var brush = new Croquis.Brush();
brush.setSize(10);
croquis.setTool(brush);
croquis.down(0, 0);

var brushPointer = document.getElementById("pointer");
setInterval(() => {
    var letters = '0123456789ABCDEF';
    var color = '#';
    for (var i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    var x = Math.floor(Math.random() * width);
    var y = Math.floor(Math.random() * height);

    brush.setColor(color);
    croquis.move(x, y, Math.random() * 5 + 1);

    pointer.style.top = "" + (y - 17) + "px";
    pointer.style.left = "" + (x - 10) + "px";
}, 500);

// Setup the socket handlers
var socket = io();

socket.on("cursor", (position) => {
    console.log(data);
});

socket.on("progress", (percentage) => {
    console.log(data);
});

socket.on("f_draw", (frame) => {
    console.log(data);
});

socket.on("p_draw", (delta) => {
    console.log(data);
});

socket.on("brush", (brush) => {
    console.log(data);
});