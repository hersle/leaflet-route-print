var centerlat = 61.1088956;
var centerlon = 10.4665695;
var center = [centerlat, centerlon];

// map.getContainer().style will NOT return values set in stylesheet,
// so set them here instead
document.getElementById("map").style.width = "100vw";
document.getElementById("map").style.height = "100vh";

var map = L.map("map", {
	preferCanvas: true
});
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

function rectangleWidth(r) {
	return r[1][0] - r[0][0];
}

function rectangleHeight(r) {
	return r[1][1] - r[0][1];
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
			console.assert(p !== undefined, "no intersection point");
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

function printRoute(ll, w, h) {
	if (ll.length == 0) {
		return;
	}
	var l = ll.slice(); // copy array
	for (var i = 0; i < l.length; i++) {
		// convert from geographical coordinates to pixel coordinates (so paper size becomes meaningful)
		l[i] = map.project(l[i]);
		l[i] = [l[i].x, l[i].y]
	}
	const [rects, intersections] = coverLineWithRectangles(l, w, h);

	// convert from pixel coordinates back to geographical coordinates
	for (var i = 0; i < intersections.length; i++) {
		intersections[i] = map.unproject(intersections[i]);
	}
	for (var i = 0; i < rects.length; i++) {
		rects[i][0] = map.unproject(rects[i][0]);
		rects[i][1] = map.unproject(rects[i][1]);
		rects[i][0] = [rects[i][0].lat, rects[i][0].lng];
		rects[i][1] = [rects[i][1].lat, rects[i][1].lng];
	}

	rectGroup.clearLayers();
	for (const rect of rects) {
		L.rectangle(rect, {color: "black"}).addTo(rectGroup);
	}
	for (const p of intersections) {
		L.circleMarker(p, {color: "red"}).addTo(rectGroup);
	}

	return rects;
}

// list paper sizes from https://en.wikipedia.org/wiki/Paper_size#Overview_of_ISO_paper_sizes
var paperSizes = [];
for (var n = 0; n <= 10; n++) {
	var w = Math.floor(841  / 2**(n/2));
	var h = Math.floor(1189 / 2**(n/2));
	paperSizes.push({name: `A${n}`, width: w, height: h});
}
for (var n = 0; n <= 10; n++) {
	var w = Math.floor(1000 / 2**(n/2));
	var h = Math.floor(1414 / 2**(n/2));
	paperSizes.push({name: `B${n}`, width: w, height: h});
}
for (var n = 0; n <= 10; n++) {
	var w = Math.floor(917  / 2**(n/2));
	var h = Math.floor(1297 / 2**(n/2));
	paperSizes.push({name: `C${n}`, width: w, height: h});
}

// https://leafletjs.com/reference-0.7.7.html#icontrol
L.Control.PrintRouteControl = L.Control.extend({
	options: {
		position: "topright",
	},
	onAdd: function(map) {
		var container = L.DomUtil.create("form", "text-input leaflet-bar");
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

		var p1 = L.DomUtil.create("p");
		var p2 = L.DomUtil.create("p");
		var p3 = L.DomUtil.create("p");
		var p4 = L.DomUtil.create("p");

		var i11 = L.DomUtil.create("input");
		var i12 = L.DomUtil.create("input");
		var i21 = L.DomUtil.create("input");
		var i22 = L.DomUtil.create("input");
		var s3  = L.DomUtil.create("select");
		var s   = L.DomUtil.create("select");
		var b4  = L.DomUtil.create("button");
		i11.id = "input-scale-paper";
		i12.id = "input-scale-world";
		i21.id = "input-size-width";
		i22.id = "input-size-height";
		s3.id  = "input-orientation";
		i11.defaultValue = 1;
		i12.defaultValue = 100000;
		i21.defaultValue = 210;
		i22.defaultValue = 297;
		i22.defaultValue = 297;
		s3.appendChild(new Option("Portrait", "portrait"));
		s3.appendChild(new Option("Landscape", "landscape"));
		i11.type = "number";
		i12.type = "number";
		i21.type = "number";
		i22.type = "number";
		b4.id = "input-print";
		b4.innerHTML = "Print as PDF";
		b4.style.display = "block";
		b4.style.width = "100%";
		s.id = "input-size-preset";

		var opt = document.createElement("option");
		opt.innerHTML = "custom";
		opt.value = "custom";
		s.appendChild(opt);
		for (var paperSize of paperSizes) {
			var opt = document.createElement("option");
			opt.innerHTML = paperSize.name;
			opt.value = paperSize.name;
			s.appendChild(opt);
        }

		var l1 = L.DomUtil.create("label");
		var l2 = L.DomUtil.create("label");
		var l3 = L.DomUtil.create("label");
		var l4 = L.DomUtil.create("label");
		l1.innerHTML = "Print scale:";
		l2.innerHTML = "Paper size:";
		l3.innerHTML = "Orientation:";
		l4.innerHTML = "Print:";
		l1.for = i11.id + " " + i11.id;
		l2.for = i21.id + " " + i21.id;
		l3.for = s3.id;
		l4.for = b4.id;

		p1.appendChild(l1);
		p1.appendChild(i11);
		p1.innerHTML += " : ";
		p1.appendChild(i12);

		p2.appendChild(l2);
		p2.appendChild(i21);
		p2.innerHTML += " mm x ";
		p2.appendChild(i22);
		p2.innerHTML += " mm = ";
		p2.appendChild(s);

		p3.appendChild(l3);
		p3.appendChild(s3);

		p4.appendChild(l4);
		p4.appendChild(b4);

		container.appendChild(p1);
		container.appendChild(p2);
		container.appendChild(p3);
		container.appendChild(p4);

		return container;
	},
});

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

async function printMap(r) {
	var rect = [[r[0][0], r[0][1]], [r[1][0], r[1][1]]]; // copy
	rect[0] = map.project(rect[0]);
	rect[1] = map.project(rect[1]);
	rect[0] = [rect[0].x, rect[0].y];
	rect[1] = [rect[1].x, rect[1].y];
	var w = rectangleWidth(rect);
	var h = rectangleHeight(rect);
	var c = rectangleCenter(rect);
	c = map.unproject(c);

	var cont = document.getElementById("map");
	cont.style.width = `${w}px`;
	cont.style.height = `${h}px`;
	map.invalidateSize();
	map.setView(c, map.getZoom(), {animate: false});
	map.invalidateSize();

	var imgDataUrl;
	var finished = false;
	leafletImage(map, function(err, canvas) {
		imgDataUrl = canvas.toDataURL();
		finished = true;
	});

	while (!finished) { // wait for the callback to finish before returning, so that this image is generated before attempting to generate the next image
		await sleep(100); // TODO: rewrite everything to use events/callbacks instead of sleep
	}
	return imgDataUrl;
}

var points = [];

function previewRoutePrint() {
	// keep input fields as wide as they need to be
	var i11 = document.getElementById("input-scale-paper");
	var i12 = document.getElementById("input-scale-world");
	var i21 = document.getElementById("input-size-width");
	var i22 = document.getElementById("input-size-height");
	i11.size = max(1, i11.value.toString().length+1);
	i12.size = max(1, i12.value.toString().length+1);
	i21.size = max(1, i21.value.toString().length+1);
	i22.size = max(1, i22.value.toString().length+1);
	printRouteWrapper(false);
}

function printRouteFromInputs() {
	printRouteWrapper(true);
}

async function printRouteWrapper(print) {
	var sPaper = parseInt(document.getElementById("input-scale-paper").value);
	var sWorld = parseInt(document.getElementById("input-scale-world").value);
	var wmmPaper = parseInt(document.getElementById("input-size-width").value);
	var hmmPaper = parseInt(document.getElementById("input-size-height").value);
	if (document.getElementById("input-orientation").value == "landscape") {
		var tmp = wmmPaper;
		wmmPaper = hmmPaper;
		hmmPaper = tmp;
	}
	var paperToWorld = sPaper / sWorld;
	var worldToPaper = 1 / paperToWorld;
	var wmmWorld = wmmPaper * worldToPaper;
	var hmmWorld = hmmPaper * worldToPaper;
	var wpxWorld = metersToPixels(wmmWorld / 1000);
	var hpxWorld = metersToPixels(hmmWorld / 1000);
	var rects = printRoute(points, wpxWorld, hpxWorld);

	if (print) {
		map.removeLayer(rectGroup);

		var originalWidth = map.getContainer().style.width;
		var originalHeight = map.getContainer().style.height;

		var pdf = new jspdf.jsPDF();
		for (var i = 0; i < rects.length; i++) {
			var rect = rects[i];
			if (i > 0) {
				pdf.addPage([wmmPaper, hmmPaper]);
			}
			var img = await printMap(rect);
			pdf.addImage(img, "jpeg", 0, 0, wmmPaper, hmmPaper);
		}
		pdf.save("pdf.pdf");

		map.getContainer().style.width = originalWidth;
		map.getContainer().style.height = originalHeight;
		map.invalidateSize();

		map.addLayer(rectGroup);
	}
}

var line;
var lineGroup = L.layerGroup();
lineGroup.addTo(map);
function addGeoJson() {
	for (var feature of geojson.features) {
		var coords = feature.geometry.coordinates;
		coords = [coords[1], coords[0]];
		points.push(coords);
	}
	line = L.polyline(points);
	lineGroup.addLayer(line);
	map.fitBounds(line.getBounds());
}

addGeoJson();
map.addControl(new L.Control.PrintRouteControl());
document.getElementById("input-scale-paper").addEventListener("input", previewRoutePrint);
document.getElementById("input-scale-world").addEventListener("input", previewRoutePrint);
document.getElementById("input-size-width").addEventListener("input", previewRoutePrint);
document.getElementById("input-size-height").addEventListener("input", previewRoutePrint);
document.getElementById("input-print").addEventListener("click", printRouteFromInputs);
document.getElementById("input-size-preset").addEventListener("input", function(event) {
	if (this.selectedIndex > 0) { // 0 is "custom"
		document.getElementById("input-size-width").value = paperSizes[this.selectedIndex-1].width;
		document.getElementById("input-size-height").value = paperSizes[this.selectedIndex-1].height;
		previewRoutePrint();
	}
});
function onInputSizeChange(event) {
	var w = document.getElementById("input-size-width").value;
	var h = document.getElementById("input-size-height").value;
	var i = paperSizes.findIndex(size => size.width == w && size.height == h);
	document.getElementById("input-size-preset").selectedIndex = i+1;
}
document.getElementById("input-size-width").addEventListener("input", onInputSizeChange);
document.getElementById("input-size-height").addEventListener("input", onInputSizeChange);
document.getElementById("input-orientation").addEventListener("change", previewRoutePrint);
previewRoutePrint();
