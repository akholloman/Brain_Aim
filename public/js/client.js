// Canvas
var canvas = document.getElementById("canvas");	
if (canvas.getContext)
    var ctx = canvas.getContext("2d");

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