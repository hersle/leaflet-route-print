var centerlat = 61.1088956;
var centerlon = 10.4665695;
var center = [centerlat, centerlon];

var map = L.map("map");
var tl = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
	attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
});
tl.addTo(map);
map.setView(center, 15);
