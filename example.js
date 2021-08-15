var centerlat = 61.1088956;
var centerlon = 10.4665695;
var center = [centerlat, centerlon];

var map = L.map("map");
var tl = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
	attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
});
tl.addTo(map);
L.control.scale({metric: true, imperial: false}).addTo(map);
map.setView(center, 15);

// keep all rectangles in one group
var rectGroup = L.layerGroup();
rectGroup.addTo(map);

function min(a, b) {
	return a < b ? a : b;
}

function max(a, b) {
	return a > b ? a : b;
}

function rectIsOk(r, w, h) {
	return r[1][0] - r[0][0] <= w && r[1][1] - r[0][1] <= h;
}

function growRect(r, x, y) {
	return [[min(r[0][0], x), min(r[0][1], y)], [max(r[1][0], x), max(r[1][1], y)]];
}

function intersectSegments(l1, l2) {
	// see https://en.wikipedia.org/wiki/Line%E2%80%93line_intersection#Given_two_points_on_each_line_segment
	const [[x1, y1], [x2, y2]] = l1;
	const [[x3, y3], [x4, y4]] = l2;
	var d = (x1-x2)*(y3-y4) - (y1-y2)*(x3-x4);
	var t = ((x1-x3)*(y3-y4) - (y1-y3)*(x3-x4)) / d;
	var u = ((x2-x1)*(y1-y3) - (y2-y1)*(x1-x3)) / d;
	if (d != 0 && t >= 0 && t <= 1 && u >= 0 && u <= 1) {
		var x = x1 + t*(x2-x1);
		var y = y1 + t*(y2-y1);
		return [x, y];
	} else {
		return undefined
	}
}

function intersectRectangleSegment(r, s) {
	var p1 = r[0];
	var p3 = r[1];
	var p2 = [p3[0], p1[1]];
	var p4 = [p1[0], p3[1]];
	var s1 = [p1, p2];
	var s2 = [p2, p3];
	var s3 = [p3, p4];
	var s4 = [p4, p1];
	var ss = [s1, s2, s3, s4];
	for (var side of ss) {
		var p = intersectSegments(s, side);
		// don't register intersection if it is in the beginning corner
		if (p != undefined && p[0] != s[0][0] && p[1] != s[0][1]) {
			return p; // intersect with a side
		}
	}
	return undefined; // no intersection
}

function growRectBounded(r, d, w, h) {
	var min = r[0].slice(); // copy to avoid modifying input
	var max = r[1].slice();
	var size = [max[0] - min[0], max[1] - min[1]];

	if (d[0] > 0) {
		max[0] = max[0] + w - size[0];
	} else {
		min[0] = min[0] - w + size[0];
	}

	if (d[1] > 0) {
		max[1] = max[1] + h - size[1];
	} else {
		min[1] = min[1] - h + size[1];
	}

	return [min, max];
}

function rectangleCenter(r) {
	return [(r[0][0]+r[1][0])/2, (r[0][1]+r[1][1])/2]
}

function centerRectangle(r1, c2) {
	var c1 = rectangleCenter(r1);
	for (var i = 0; i < 2; i++) {
		for (var j = 0; j < 2; j++) {
			r1[i][j] += c2[j] - c1[j];
		}
	}
	return r1;
}

function coverLineWithRectangles(l, w, h) {
	var rects = [];
	var intersections = [];
	var rect = [[l[0][0], l[0][1]], [l[0][0], l[0][1]]];
	for (var i = 0; i < l.length; i++) {
		var x = l[i][0];
		var y = l[i][1];
		var grect = growRect(rect, x, y);
		if (i == 0 || rectIsOk(grect, w, h)) { // whole segment fits in rectangle [w,h]
			rect = grect;
		} else { // segment must be divided to fit in rectangle [w,h]
			var s = [l[i-1], l[i]];
			var vs = [s[1][0]-s[0][0],s[1][1]-s[0][1]];
			var bigRect = growRectBounded(rect, vs, w, h); // create rectangle as big as possible in the direction of the segment 
			var p = intersectRectangleSegment(bigRect, s); // find where it intersects the segment
			intersections.push(p); // store intersection point for debugging
			l.splice(i, 0, p); // divide the segment
			rect = growRect(rect, p[0], p[1]); // grow the cover rectangle to accomodate the intersection point
			bigRect = centerRectangle([[0,0], [w,h]], rectangleCenter(rect)); // center the [w,h] rectangle on the area it must cover (there will be freedom in one direction only)
			rects.push(bigRect);
			var rect = [[l[i][0], l[i][1]], [l[i][0], l[i][1]]]; // reset the cover rectangle for new segments
		}
	}
	// also print the last segments in a [w,h] rectangle
	var bigRect = centerRectangle([[0,0], [w,h]], rectangleCenter(rect));
	rects.push(bigRect);
	return [rects, intersections];
}

function pixelsToMeters(pixels) {
	// https://stackoverflow.com/questions/49122416/use-value-from-scale-bar-on-a-leaflet-map
	var containerMidHeight = map.getSize().y / 2,
	point1 = map.containerPointToLatLng([0, containerMidHeight]),
	point2 = map.containerPointToLatLng([pixels, containerMidHeight]);
	return point1.distanceTo(point2);
}

function metersToPixels(meters) {
	return meters / pixelsToMeters(1);
}

function printRoute(w, h) {
	var points = routing.getWaypoints();
	for (var i = 0; i < points.length; i++) {
		points[i] = [points[i].lat, points[i].lng];
		// convert from geographical coordinates to pixel coordinates (so paper size becomes meaningful)
		points[i] = map.project(points[i]);
		points[i] = [points[i].x, points[i].y]
	}
	const [rects, intersections] = coverLineWithRectangles(points, w, h);

	// convert from pixel coordinates back to geographical coordinates
	for (var i = 0; i < intersections.length; i++) {
		intersections[i] = map.unproject(intersections[i]);
	}
	for (var i = 0; i < rects.length; i++) {
		rects[i][0] = map.unproject(rects[i][0]);
		rects[i][1] = map.unproject(rects[i][1]);
	}

	rectGroup.clearLayers();
	for (const rect of rects) {
		rectGroup.addLayer(L.rectangle(rect, {color: "black"}));
	}
	for (const p of intersections) {
		rectGroup.addLayer(L.circleMarker(p, {color: "red"}));
	}
}

// https://leafletjs.com/reference-0.7.7.html#icontrol
L.Control.PrintRouteControl = L.Control.extend({
	options: {
		position: "topright",
	},
	onAdd: function(map) {
		var container = L.DomUtil.create("div", "text-input leaflet-bar");
		container.style.backgroundColor = "white";
		container.style.padding = "0.5em";
		container.addEventListener("click", function(event) {
			event.stopPropagation();
		});
		container.addEventListener("mousedown", function(event) {
			event.stopPropagation();
		});
		container.addEventListener("dblclick", function(event) {
			event.stopPropagation();
		});

		var label1 = L.DomUtil.create("label");
		label1.innerHTML = "<b>Print scale</b>: 1 : ";
		var input1 = L.DomUtil.create("input");
		input1.id = "input-scale";
		input1.type = "text";
		input1.style.width = "8em";
		input1.defaultValue = "10000";
		input1.addEventListener("input", function() {
			console.log(`scale ${input1.value}`);
		});
		label1.style.display = "block";
		label1.style.marginBottom = "1em";
		label1.appendChild(input1);

		var label2 = L.DomUtil.create("label");
		label2.innerHTML = "<b>Paper size</b>: ";
		var input21 = L.DomUtil.create("input");
		var input22 = L.DomUtil.create("input");
		input21.id = "input-aspect-width";
		input22.id = "input-aspect-height";
		input21.type = "text";
		input22.type = "text";
		input21.style.width = "4em";
		input22.style.width = "4em";
		input21.defaultValue = "210";
		input22.defaultValue = "297";
		label2.appendChild(input21);
		label2.innerHTML += " mm x ";
		label2.appendChild(input22);
		label2.innerHTML += " mm";
		label2.style.display = "block";

		var button = L.DomUtil.create("button");
		button.innerHTML = "Print";
		button.addEventListener("click", function(event) {
			event.stopPropagation(); // prevent from reaching underlying map
			var s = parseInt(document.getElementById("input-scale").value);
			var wmmPaper = parseInt(document.getElementById("input-aspect-width").value);
			var hmmPaper = parseInt(document.getElementById("input-aspect-height").value);
			var paperToWorld = 1 / s;
			var worldToPaper = s;
			var wmmWorld = wmmPaper * s;
			var hmmWorld = hmmPaper * s;
			var wpxWorld = metersToPixels(wmmWorld / 1000);
			var hpxWorld = metersToPixels(hmmWorld / 1000);
			printRoute(wpxWorld, hpxWorld);
		});

		container.appendChild(label1);
		container.appendChild(label2);
		container.appendChild(button);
		return container;
	},
});
map.addControl(new L.Control.PrintRouteControl());

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
