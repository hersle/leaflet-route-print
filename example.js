var centerlat = 61.1088956;
var centerlon = 10.4665695;
var center = [centerlat, centerlon];

var map = L.map("map");
var tl = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
	attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
});
tl.addTo(map);
map.setView(center, 15);

// keep all rectangles in one group
var rectGroup = L.layerGroup();
rectGroup.addTo(map);

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
function min(a, b) {
	return a < b ? a : b;
}

function max(a, b) {
	return a > b ? a : b;
}

function coverLineWithRectangles(l, w, h) {
	var xmin = l[0][0];
	var ymin = l[0][1];
	var xmax = l[0][0];
	var ymax = l[0][1];
	for (var i = 1; i < l.length; i++) {
		var x = l[i][0];
		var y = l[i][1];
		xmin = min(xmin, x);
		ymin = min(ymin, y);
		xmax = max(xmax, x);
		ymax = max(ymax, y);
	}
	return [[xmin, ymin], [xmax, ymax]];
}

addControlButton("topleft", "P", "Print", function(event) {
	var points = routing.getWaypoints();
	for (var i = 0; i < points.length; i++) {
		points[i] = [points[i].lat, points[i].lng];
	}
	var rect = coverLineWithRectangles(points, 0, 0);

	rectGroup.clearLayers();
	var rect = L.rectangle(rect);
	rectGroup.addLayer(rect);
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
