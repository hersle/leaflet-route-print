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
// inspired by https://stackoverflow.com/a/56904070/3527139
map.createPane("rectangles");
map.getPane("rectangles").style.opacity = "0.25";
var tl = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
	attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
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

function extendRectangle(r, p) {
	return [[r[0][0]-p, r[0][1]-p], [r[1][0]+p, r[1][1]+p]];
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

// TODO: this should be done at the rectangle position(s), NOT at the map view position
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

function dpi(wmmWorld, latitude) {
	// see https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames#Resolution_and_Scale
	var metersPerPixel = 156543.03 * Math.cos(latitude/180*Math.PI) / (2**map.getZoom());
	return Math.floor((wmmWorld / 1000) / metersPerPixel);
}

function printRoute(ll, w, h, p) {
	if (ll.length == 0) {
		return;
	}
	var l = ll.slice(); // copy array
	for (var i = 0; i < l.length; i++) {
		// convert from geographical coordinates to pixel coordinates (so paper size becomes meaningful)
		l[i] = map.project(l[i]);
		l[i] = [l[i].x, l[i].y]
	}
	const [rects, intersections] = coverLineWithRectangles(l, w-2*p, h-2*p);

	// convert from pixel coordinates back to geographical coordinates
	for (var i = 0; i < intersections.length; i++) {
		intersections[i] = map.unproject(intersections[i]);
	}
	rectGroup.clearLayers();
	var showPadding = document.getElementById("input-padding-preview").checked;
	for (var i = 0; i < rects.length; i++) {
		var orgrect = [[rects[i][0][0], rects[i][0][1]], [rects[i][1][0], rects[i][1][1]]];
		orgrect[0] = map.unproject(orgrect[0]);
		orgrect[1] = map.unproject(orgrect[1]);
		orgrect[0] = [orgrect[0].lat, orgrect[0].lng];
		orgrect[1] = [orgrect[1].lat, orgrect[1].lng];

		rects[i] = extendRectangle(rects[i], p);
		rects[i][0] = map.unproject(rects[i][0]);
		rects[i][1] = map.unproject(rects[i][1]);
		rects[i][0] = [rects[i][0].lat, rects[i][0].lng];
		rects[i][1] = [rects[i][1].lat, rects[i][1].lng];

		L.rectangle(rects[i], {stroke: true, weight: 1, opacity: 1, color: "black", fillColor: "grey", fillOpacity: 1.0, pane: "rectangles"}).addTo(rectGroup);
		if (showPadding) {
			L.rectangle(orgrect, {stroke: true, weight: 1, opacity: 1.0, fill: false, color: "red", pane: "rectangles"}).addTo(rectGroup);
		}
	}
	for (const p of intersections) {
		L.circleMarker(p, {stroke: false, color: "red", opacity: 1, fillOpacity: 1.0, pane: "rectangles"}).addTo(rectGroup);
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
		var l1 = L.DomUtil.create("label");
		var i11 = L.DomUtil.create("input");
		var i12 = L.DomUtil.create("input");
		i11.id = "input-scale-paper";
		i11.type = "number";
		i11.defaultValue = 1;
		i12.id = "input-scale-world";
		i12.type = "number";
		i12.defaultValue = 100000;
		l1.innerHTML = "Print scale:";
		l1.for = i11.id + " " + i11.id;
		p1.append(l1, i11, " : ", i12);
		container.append(p1);

		var p2 = L.DomUtil.create("p");
		var l2 = L.DomUtil.create("label");
		var i21 = L.DomUtil.create("input");
		var i22 = L.DomUtil.create("input");
		var s2  = L.DomUtil.create("select");
		i21.id = "input-size-width";
		i21.type = "number";
		i21.defaultValue = 210;
		i22.id = "input-size-height";
		i22.type = "number";
		i22.defaultValue = 297;
		s2.id = "input-size-preset";
		s2.append(new Option("custom"));
		for (var paperSize of paperSizes) {
			s2.append(new Option(paperSize.name));
        }
		l2.innerHTML = "Paper size:";
		l2.for = i21.id + " " + i21.id;
		p2.append(l2, i21, " mm x ", i22, " mm = ", s2);
		container.append(p2);

		var p3 = L.DomUtil.create("p");
		var l3 = L.DomUtil.create("label");
		var s3  = L.DomUtil.create("select");
		s3.id  = "input-orientation";
		l3.innerHTML = "Orientation:";
		s3.append(new Option("Portrait", "portrait"), new Option("Landscape", "landscape"));
		l3.for = s3.id;
		p3.append(l3, s3);
		container.append(p3);

		var p4 = L.DomUtil.create("p");
		var l4 = L.DomUtil.create("label");
		var i4 = L.DomUtil.create("input");
		var c4 = L.DomUtil.create("input");
		i4.id = "input-padding";
		i4.type = "number";
		i4.defaultValue = 10;
		l4.innerHTML = "Padding:";
		l4.for = i4.id;
		c4.id = "input-padding-preview";
		c4.type = "checkbox";
		c4.defaultChecked = true;
		p4.append(l4, i4, " mm ", c4, "Preview");
		container.append(p4);

		var p5 = L.DomUtil.create("p");
		var l5 = L.DomUtil.create("label");
		var i5 = L.DomUtil.create("span");
		i5.id = "input-pages";
		//i5.disabled = true;
		l5.innerHTML = "Pages:";
		p5.append(l5, i5);
		container.append(p5);

		var p6 = L.DomUtil.create("p");
		var l6 = L.DomUtil.create("label");
		var i6 = L.DomUtil.create("span");
		l6.innerHTML = "DPI:";
		i6.id = "input-dpi";
		p6.append(l6, i6);
		container.append(p6);

		var p7 = L.DomUtil.create("p");
		var l7 = L.DomUtil.create("label");
		var b7  = L.DomUtil.create("button");
		b7.id = "input-print";
		b7.innerHTML = "Print as PDF";
		b7.style.display = "block";
		l7.innerHTML = "Print:";
		l7.for = b7.id;
		p7.append(l7, b7);
		container.append(p7);

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
		await sleep(2000); // TODO: rewrite everything to use events/callbacks instead of sleep
	}
	return imgDataUrl;
}

function previewRoutePrint() {
	// keep input fields as wide as they need to be
	var i11 = document.getElementById("input-scale-paper");
	var i12 = document.getElementById("input-scale-world");
	var i21 = document.getElementById("input-size-width");
	var i22 = document.getElementById("input-size-height");
	var i4  = document.getElementById("input-padding");
	i11.size = max(1, i11.value.toString().length+1);
	i12.size = max(1, i12.value.toString().length+1);
	i21.size = max(1, i21.value.toString().length+1);
	i22.size = max(1, i22.value.toString().length+1);
	i4.size  = max(1, i4.value.toString().length+1);
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
	var pmmPaper = parseInt(document.getElementById("input-padding").value);
	if (document.getElementById("input-orientation").value == "landscape") {
		var tmp = wmmPaper;
		wmmPaper = hmmPaper;
		hmmPaper = tmp;
	}
	var paperToWorld = sPaper / sWorld;
	var worldToPaper = 1 / paperToWorld;
	var wmmWorld = wmmPaper * worldToPaper;
	var hmmWorld = hmmPaper * worldToPaper;
	var pmmWorld = pmmPaper * worldToPaper;

	var wpxWorld = metersToPixels(wmmWorld / 1000);
	var hpxWorld = metersToPixels(hmmWorld / 1000);
	var ppxWorld = metersToPixels(pmmWorld / 1000);

	// https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames
	//console.log(`rect center lat ${c.lat}`);
	var res = 156543.03 * Math.cos(map.getCenter().lat/180*Math.PI) / (2**map.getZoom()); // meters / pixel
	var wmWorld = wmmWorld / 1000;
	var hmWorld = hmmWorld / 1000;
	var wpxTile = wmWorld / res;
	var hpxTile = hmWorld / res;
	var d = wpxTile / (wmmPaper / 25.4);
	d = wpxTile / (hmmPaper / 25.4);
	d = Math.floor(d);
	console.log(`${wpxTile} OSM pixels wide`);

	// TODO: wrong?
	var span = document.getElementById("input-dpi");
	span.innerHTML = d;
	if (d >= 300) {
		span.style.color = "green"; // good
	} else if (d >= 150) {
		span.style.color = "gold"; // mediocre
	} else {
		span.style.color = "red"; // bad
	}

	var rects = printRoute(points, wpxWorld, hpxWorld, ppxWorld);

	document.getElementById("input-pages").innerHTML = rects.length;

	if (print) {
		map.removeLayer(rectGroup);

		var originalWidth = map.getContainer().style.width;
		var originalHeight = map.getContainer().style.height;

		var pdf = new jspdf.jsPDF();
		pdf.setFontSize(15);
		for (var i = 0; i < rects.length; i++) {
			var rect = rects[i];
			if (i > 0) {
				pdf.addPage([wmmPaper, hmmPaper]);
			}
			var img = await printMap(rect);
			pdf.addImage(img, "jpeg", 0, 0, wmmPaper, hmmPaper);
			pdf.text(`Page ${i+1} of ${rects.length}`, wmmPaper-5, 0+5, {align: "right", baseline: "top"});
			pdf.text(`Scale ${sPaper} : ${sWorld}`, 0+5, hmmPaper-5, {align: "left", baseline: "bottom"});
			pdf.text(tl.getAttribution().replace(/<[^>]*>/g, ""), wmmPaper-5, hmmPaper-5, {align: "right", baseline: "bottom"});
		}
		pdf.autoPrint();
		pdf.output("pdfobjectnewwindow", {filename: "route.pdf"});

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
document.getElementById("input-padding").addEventListener("input", previewRoutePrint);
document.getElementById("input-padding-preview").addEventListener("change", previewRoutePrint);
map.addEventListener("zoomend", previewRoutePrint); // just for updating DPI value TODO: remove/optimize
previewRoutePrint();
