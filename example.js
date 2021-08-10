var centerlat = 61.1088956;
var centerlon = 10.4665695;
var center = [centerlat, centerlon];

var map = L.map("map");
var tl = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
	attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
});
tl.addTo(map);
map.setView(center, 15);

function addControlButton(pos, text, title, cb) {
	L.Control.CustomButton = L.Control.extend({
		onAdd: function(map) {
			var div = document.createElement("div");
			div.className += " leaflet-bar";
			var el = document.createElement("a");
			el.innerHTML = text;
			el.className += " leaflet-control-zoom-in";
			el.style += " vertical-align: middle;";
			el.href = "#";
			el.title = title;
			el.setAttribute("aria-label", title);
			el.role = "Button";
			div.appendChild(el);
			L.DomEvent.on(el, "click", function(event) {
				L.DomEvent.stopPropagation(event); // prevent from reaching underlying map
				cb(event);
			});
			return div;
		},
		onRemove: function(map) {
		},
	});

	var button = new L.Control.CustomButton({position: pos});
	button.addTo(map);
}

addControlButton("topleft", "P", "Print", function(event) {
	console.log(event);
});

var routing = new L.Routing({
	position: 'topright',
	routing: {
		router: function(p1, p2, cb) { 
			// straight line
			cb(null, L.polyline([p1, p2]));
		}
	}, 
	tooltips: {
		waypoint: 'Waypoint. Drag to move; Click to remove.',
		segment: 'Drag to create a new waypoint'
	}, 
	styles: {         // see http://leafletjs.com/reference.html#polyline-options
		trailer: {},  // drawing line
		track: {},    // calculated route result
		nodata: {},   // line when no result (error)
	}, 
	shortcut: {
		draw: {
			enable: 68,   // 'd'
			disable: 81   // 'q'
		}
	}
});
map.addControl(routing);
routing.draw(true);
