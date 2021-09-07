import "./jsPDF/jspdf.umd.min.js";
import "./leaflet-image/leaflet-image.js";
import {createElement, setProperties} from "./util.js";

// TODO: make a proper leaflet plugin: https://github.com/Leaflet/Leaflet/blob/master/PLUGIN-GUIDE.md

function pixelsToMeters(map, pixels, pos) {
	// https://stackoverflow.com/questions/49122416/use-value-from-scale-bar-on-a-leaflet-map
	var point1 = map.latLngToLayerPoint(pos).add(L.point(-pixels/2, 0));
	var point2 = map.latLngToLayerPoint(pos).add(L.point(+pixels/2, 0));
	var point1 = map.layerPointToLatLng(point1);
	var point2 = map.layerPointToLatLng(point2);
	return point1.distanceTo(point2);
}

function metersToPixels(map, meters, pos) {
	return meters / pixelsToMeters(map, 1, pos);
}

class Rectangle {
	constructor(min, max) {
		this.min = min;
		this.max = max;
	}

	get xmin() { return this.min.x; }
	get ymin() { return this.min.y; }
	get xmax() { return this.max.x; }
	get ymax() { return this.max.y; }

	get corner1() { return L.point(this.xmin, this.ymin); }
	get corner2() { return L.point(this.xmax, this.ymin); }
	get corner3() { return L.point(this.xmax, this.ymax); }
	get corner4() { return L.point(this.xmin, this.ymax); }

	get middle() { return this.min.add(this.max).divideBy(2); }

	get size() { return this.max.subtract(this.min); }
	get width() { return this.size.x; }
	get height() { return this.size.y; }

	center(c) {
		var d = c.subtract(this.middle);
		return new Rectangle(this.min.add(d), this.max.add(d));
	}

	extend(p) {
		var min = L.point(Math.min(this.xmin, p.x), Math.min(this.ymin, p.y));
		var max = L.point(Math.max(this.xmax, p.x), Math.max(this.ymax, p.y));
		return new Rectangle(min, max);
	}

	extendBounded(d, w, h) {
		var xmin, ymin, xmax, ymax;

		if (d.x > 0) {
			xmin = this.xmin;
			xmax = this.xmax + w - this.width;
		} else {
			xmin = this.xmin - w + this.width;
			xmax = this.xmax;
		}
		if (d.y > 0) {
			ymin = this.ymin;
			ymax = this.ymax + h - this.height;
		} else {
			ymin = this.ymin - h + this.height;
			ymax = this.ymax;
		}

		return new Rectangle(L.point(xmin, ymin), L.point(xmax, ymax));
	}

	pad(p) {
		return new Rectangle(this.min.subtract(L.point(p, p)), this.max.add(L.point(p,p)));
	}

	isSmallerThan(w, h) {
		return this.size.x <= w && this.size.y <= h;
	}

	intersection(s) {
		var s1 = new Segment(this.corner1, this.corner2);
		var s2 = new Segment(this.corner2, this.corner3);
		var s3 = new Segment(this.corner3, this.corner4);
		var s4 = new Segment(this.corner4, this.corner1);
		var ss = [s1, s2, s3, s4];
		for (var side of ss) {
			var p = s.intersection(side);
			// don't register intersection if it is in the beginning corner
			if (p != undefined && p.x != s.p1.x && p.y != s.p1.y) {
				return p; // intersect with a side
			}
		}
		return undefined; // no intersection
	}
}

class Segment {
	constructor(p1, p2) {
		this.p1 = p1;
		this.p2 = p2;
	}

	get displacement() { return this.p2.subtract(this.p1); }

	intersection(s2) {
		// see https://en.wikipedia.org/wiki/Line%E2%80%93line_intersection#Given_two_points_on_each_line_segment
		var s1 = this;
		var x1 = s1.p1.x, y1 = s1.p1.y, x2 = s1.p2.x, y2 = s1.p2.y; // segment 1
		var x3 = s2.p1.x, y3 = s2.p1.y, x4 = s2.p2.x, y4 = s2.p2.y; // segment 2
		var d = (x1-x2)*(y3-y4) - (y1-y2)*(x3-x4);
		var t = ((x1-x3)*(y3-y4) - (y1-y3)*(x3-x4)) / d;
		var u = ((x2-x1)*(y1-y3) - (y2-y1)*(x1-x3)) / d;
		if (d != 0 && t >= 0 && t <= 1 && u >= 0 && u <= 1) {
			var x = x1 + t*(x2-x1);
			var y = y1 + t*(y2-y1);
			return L.point(x, y);
		} else {
			return undefined
		}
	}
}

function coverLineWithRectangles(l, w, h) {
	var rects = [];
	var intersections = [];
	var rect = new Rectangle(l[0], l[0]);
	for (var i = 1; i < l.length; i++) {
		var grect = rect.extend(l[i]);
		if (grect.isSmallerThan(w, h)) { // whole segment fits in rectangle [w,h]
			rect = grect;
		} else { // segment must be divided to fit in rectangle [w,h]
			var s = new Segment(l[i-1], l[i]);
			var bigRect = rect.extendBounded(s.displacement, w, h); // create rectangle as big as possible in the direction of the segment 
			var p = bigRect.intersection(s); // find where it intersects the segment
			console.assert(p !== undefined, "no intersection point");
			intersections.push(p); // store intersection point for debugging
			l.splice(i, 0, p); // divide the segment TODO: don't modify input array
			rect = rect.extend(p); // grow the cover rectangle to accomodate the intersection point
			rect = (new Rectangle(L.point(0, 0), L.point(w, h))).center(rect.middle); // grow rectangle to full [w,h] size and center it on the area it must cover
			rects.push(rect); // add the complete rectangle
			rect = new Rectangle(p, p); // reset the cover rectangle for new segments
		}
	}
	// also print the last segments in a [w,h] rectangle
	rect = (new Rectangle(L.point(0, 0), L.point(w, h))).center(rect.middle);
	rects.push(rect);
	return [rects, intersections];
}

// https://leafletjs.com/reference-0.7.7.html#icontrol
L.Control.PrintRouteControl = L.Control.extend({
	options: {
		position: "topleft",
	},

	initialize: function() {
		this.hasRoute = false;

		this.imgDataUrls = [];

		this.setImageFormat("jpeg");
		this.setStrokeColor("red");
		this.setFillColor("gray");

		// list paper sizes from https://en.wikipedia.org/wiki/Paper_size#Overview_of_ISO_paper_sizes
		this.paperSizes = [];
		for (var n = 0; n <= 6; n++) {
			var w = Math.floor(841  / 2**(n/2));
			var h = Math.floor(1189 / 2**(n/2));
			this.paperSizes.push({name: `A${n}P`, width: w, height: h});
			this.paperSizes.push({name: `A${n}L`, width: h, height: w});
		}
		for (var n = 0; n <= 6; n++) {
			var w = Math.floor(1000 / 2**(n/2));
			var h = Math.floor(1414 / 2**(n/2));
			this.paperSizes.push({name: `B${n}P`, width: w, height: h});
			this.paperSizes.push({name: `B${n}L`, width: h, height: w});
		}
	},

	onAdd: function(map) { // constructor
		this.map = map;

		// keep all rectangles in one group
		this.rectGroup = L.layerGroup();
		this.rectGroup.addTo(this.map);

		var div = createElement("div", {className: "leaflet-bar"}, {backgroundColor: "white", padding: "0.5em", borderSpacing: "0.5em"});
		var container = createElement("form", {className: "text-input"});
		L.DomEvent.disableClickPropagation(container);
		L.DomEvent.disableScrollPropagation(container);

		this.inputScale = createElement("input", {id: "input-scale-world", type: "number", defaultValue: 100000}, {width: "6em"});
		var l = createElement("label", {innerHTML: "Scale:", for: this.inputScale.id});
		var p = createElement("p");
		p.append(l, "1 : ", this.inputScale);
		container.append(p);

		this.inputWidth = createElement("input", {id: "input-size-width", type: "number", defaultValue: 210}, {width: "3.5em"});
		this.inputHeight = createElement("input", {id: "input-size-height", type: "number", defaultValue: 297}, {width: "3.5em"});
		this.inputPreset  = createElement("select", {id: "input-size-preset"});
		this.inputPreset.append(new Option("free"));
		for (var paperSize of this.paperSizes) {
			this.inputPreset.append(new Option(paperSize.name));
        }
		l = createElement("label", {innerHTML: "Paper:", for: this.inputWidth.id + " " + this.inputHeight.id});
		p = createElement("p");
		p.append(l, this.inputWidth, " mm x ", this.inputHeight, " mm = ", this.inputPreset);
		container.append(p);

		this.inputMargin = createElement("input", {id: "input-inset", type: "number", defaultValue: 10}, {width: "3em"});
		l = createElement("label", {innerHTML: "Margin:", for: this.inputMargin.id});
		p = createElement("p");
		p.append(l, this.inputMargin, " mm ");
		container.append(p);

		this.inputPrint = createElement("input", {id: "input-print", type: "button", value: "Print"}, {display: "inline"});
		this.inputDownload = createElement("a", {id: "input-download"}, {display: "inline", backgroundColor: "transparent", marginLeft: "0.5em"});
		div.append(container);
		div.append(this.inputPrint, this.inputDownload);

		this.inputScale.addEventListener("change", this.previewRoute.bind(this));
		this.inputWidth.addEventListener("change", this.previewRoute.bind(this));
		this.inputHeight.addEventListener("change", this.previewRoute.bind(this));
		this.inputWidth.addEventListener("change", this.onInputSizeChange);
		this.inputHeight.addEventListener("change", this.onInputSizeChange);
		this.inputPreset.addEventListener("change", function(event) {
			if (this.inputPreset.selectedIndex > 0) { // 0 is "free"
				this.inputWidth.value = this.paperSizes[this.inputPreset.selectedIndex-1].width;
				this.inputHeight.value = this.paperSizes[this.inputPreset.selectedIndex-1].height;
				this.previewRoute();
			}
		}.bind(this));
		this.inputMargin.addEventListener("change", this.previewRoute.bind(this));
		this.inputPrint.addEventListener("click", this.printRoute.bind(this));
		this.map.addEventListener("zoomend", this.previewRoute.bind(this));

		this.previewRoute(); // TODO: can i do this here after saving all input fields in the class?

		return div;
	},

	getAttribution: function() {
		var attrib = undefined;
		this.map.eachLayer(function(layer) {
			if (attrib == undefined && layer.getAttribution()) {
				attrib = layer.getAttribution().replace(/<[^>]*>/g, "");
			}
		});
		return attrib;
	},

	printRouteWrapper: async function(print) {
		// update paper size preset
		var w = this.inputWidth.value;
		var h = this.inputHeight.value;
		var i = this.paperSizes.findIndex(size => size.width == w && size.height == h);
		this.inputPreset.selectedIndex = i+1; // if i is -1, the index becomes 0 (free)

		setProperties(this.inputDownload, {download: "", href: "", innerHTML: ""}, {color: "black", textDecoration: "none", cursor: "default", pointerEvents: "none"});

		if (!this.hasRoute) {
			return;
		}

		var sPaper = 1;
		var sWorld = parseInt(this.inputScale.value);
		var wmmPaper = parseInt(this.inputWidth.value);
		var hmmPaper = parseInt(this.inputHeight.value);
		var pmmPaper = parseInt(this.inputMargin.value);
		var paperToWorld = sPaper / sWorld;
		var worldToPaper = 1 / paperToWorld;
		var wmmWorld = wmmPaper * worldToPaper;
		var hmmWorld = hmmPaper * worldToPaper;
		var pmmWorld = pmmPaper * worldToPaper;

		var routeCenter = this.line.getCenter();
		var wpxWorld = metersToPixels(this.map, wmmWorld / 1000, routeCenter);
		var hpxWorld = metersToPixels(this.map, hmmWorld / 1000, routeCenter);
		var ppxWorld = metersToPixels(this.map, pmmWorld / 1000, routeCenter);

		var rects = this.getRouteRectangles(this.line.getLatLngs(), wpxWorld, hpxWorld, ppxWorld);

		var dpi = Math.floor((wpxWorld / (wmmPaper / 25.4) + hpxWorld / (hmmPaper / 25.4)) / 2);
		this.inputDownload.innerHTML = `${rects.length} page${rects.length == 1 ? "" : "s"} of ${Math.floor(wpxWorld)} x ${Math.floor(hpxWorld)} pixels at`;
		var dpiSpan = document.createElement("span");
		dpiSpan.innerHTML = ` ${dpi} DPI`;
		dpiSpan.style.color = dpi >= 300 ? "green" : dpi >= 150 ? "orange" : "red";
		this.inputDownload.appendChild(dpiSpan);

		if (print) {
			var printfunc = function() {
				var orientation = wmmPaper > hmmPaper ? "landscape" : "portrait";
				var pdf = new jspdf.jsPDF({format: [wmmPaper, hmmPaper], orientation: orientation, compress: true});
				pdf.setFontSize(15);
				for (var i = 0; i < rects.length; i++) {
					var rect = rects[i];
					if (i > 0) {
						pdf.addPage([wmmPaper, hmmPaper], orientation);
					}
					var img = this.imgDataUrls[i];
					pdf.addImage(img, this.imageFormat, 0, 0, wmmPaper, hmmPaper, undefined, "FAST");
					pdf.text("Printed with hersle.github.io/leaflet-route-print", 0+5, 0+5, {align: "left", baseline: "top"});
					pdf.text(`Page ${i+1} of ${rects.length}`, wmmPaper-5, 0+5, {align: "right", baseline: "top"});
					pdf.text(`Scale ${sPaper} : ${sWorld}`, 0+5, hmmPaper-5, {align: "left", baseline: "bottom"});
					var attrib = this.getAttribution();
					if (attrib) {
						pdf.text(attrib, wmmPaper-5, hmmPaper-5, {align: "right", baseline: "bottom"});
					}
				}
				// to decide download filename: https://stackoverflow.com/a/56923508/3527139
				var blob = pdf.output("blob");
				var bytes = blob.size;
				var megabytes = (bytes / 1e6).toFixed(1); // 1 decimal
				var bloburl = URL.createObjectURL(blob);
				setProperties(this.inputDownload, {download: "route.pdf", innerHTML: `Download PDF (${megabytes} MB)`, href: bloburl}, {color: "blue", textDecoration: "underline", cursor: "pointer", pointerEvents: "auto"});
				this.inputDownload.click(); // TODO: use link only as dummy?

				this.imgDataUrls = []; // reset for next printing

				this.map.getContainer().style.width = originalWidth;
				this.map.getContainer().style.height = originalHeight;
				this.map.invalidateSize();

				this.map.addLayer(this.rectGroup);

				document.removeEventListener("printcomplete", printfunc);
			}.bind(this);
			document.addEventListener("printcomplete", printfunc);

			this.map.removeLayer(this.rectGroup);

			var originalWidth = this.map.getContainer().style.width;
			var originalHeight = this.map.getContainer().style.height;

			this.printMap(rects);
		}
	},

	getRouteRectangles: function(ll, w, h, p) {
		if (ll.length == 0) {
			return;
		}
		var l = ll.slice(); // copy array (algorithm will modify it) TODO: don't modify
		for (var i = 0; i < l.length; i++) {
			l[i] = this.map.project(l[i]); // geo to pixel coords (so paper size becomes meaningful)
		}
		const [rects, intersections] = coverLineWithRectangles(l, w-2*p, h-2*p);

		// convert from pixel coordinates back to geographical coordinates
		// TODO: better to not convert yet?
		for (var i = 0; i < intersections.length; i++) {
			intersections[i] = this.map.unproject(intersections[i]);
		}
		this.rectGroup.clearLayers();
		for (var i = 0; i < rects.length; i++) {
			var smallRect = rects[i];
			var bigRect = smallRect.pad(p);

			smallRect = [this.map.unproject(smallRect.min), this.map.unproject(smallRect.max)];
			bigRect = [this.map.unproject(bigRect.min), this.map.unproject(bigRect.max)];

			L.rectangle(bigRect, {stroke: true, weight: 1, opacity: this.rectStrokeOpacity, color: this.rectStrokeColor, fillColor: this.rectFillColor, fillOpacity: this.rectFillOpacity}).addTo(this.rectGroup);
			L.rectangle(smallRect, {stroke: true, weight: 1, opacity: this.rectStrokeOpacity, color: this.rectStrokeColor, fill: false}).addTo(this.rectGroup);
		}
		/*
		// show intersection points (only for debugging purposes) TODO: remove them completely
		if (showInset) {
			for (const p of intersections) {
				L.circleMarker(p, {radius: 5, stroke: false, color: "black", opacity: 1, fillOpacity: 1.0}).addTo(this.rectGroup);
			}
		}
		*/

		return rects;
	},

	previewRoute: function() {
		// here, "this" is not necessarily the class instance, since this function is called from an event listener, which replaces the "this" value with the element that fired the event
		// for resolutions, see https://stackoverflow.com/a/43727582/3527139
		this.printRouteWrapper(false);
	},

	printRoute: function() {
		this.printRouteWrapper(true);
	},

	setRoute: function(line) {
		// line should already be added to map
		this.line = line;
		this.map.fitBounds(this.line.getBounds(), {animate: false});
		this.hasRoute = true;
		this.previewRoute();
	},

	printMap: function(rects) {
		var printRect = function(i) {
			this.inputDownload.innerHTML = `Downloading page ${i+1} of ${rects.length} ...`;

			if (i == rects.length) {
				this.inputPrint.disabled = false;
				document.dispatchEvent(new Event("printcomplete"));
				return;
			}

			var r = rects[i];
			var w = r.width;
			var h = r.height;
			var c = this.map.unproject(r.middle);

			this.map.getContainer().style.width = `${w}px`;
			this.map.getContainer().style.height = `${h}px`;
			this.map.invalidateSize();
			this.map.setView(c, this.map.getZoom(), {animate: false});

			leafletImage(this.map, function(err, canvas) {
				if (this.imageFormat == "jpeg") {
					// make canvas background white, since jpeg does not support white background
					// https://stackoverflow.com/a/56085861/3527139
					var ctx = canvas.getContext("2d");
					ctx.globalCompositeOperation = 'destination-over';
					ctx.fillStyle = "white";
					ctx.fillRect(0, 0, canvas.width, canvas.height);
				}

				this.imgDataUrls.push(canvas.toDataURL(`image/${this.imageFormat}`));
				printRect(i+1);
			}.bind(this));
		}.bind(this);

		this.inputPrint.disabled = true;
		printRect(0);
	},

	setImageFormat: function(format) {
		if (format != "jpeg" && format != "png") {
			throw `Invalid image format: "${format}"`;
		}
		this.imageFormat = format;
	},

	setFillColor: function(color, opacity = 0.2) {
		this.rectFillColor = color;
		this.rectFillOpacity = opacity;
	},

	setStrokeColor: function(color, opacity = 1.0) {
		this.rectStrokeColor = color;
		this.rectStrokeOpacity = opacity;
	}
});
