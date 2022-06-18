import "./jsPDF/jspdf.umd.min.js";
import "./leaflet-image/leaflet-image.js";
import {createElement, setProperties} from "./util.js";

const DEBUG = false;

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

	extendBounded(s, w, h) {
		var d = s.displacement;
		var maxRect;
		if (d.x > 0 && d.y > 0) { // north-east quadrant
			maxRect = new Rectangle(L.point(this.xmin, this.ymin), L.point(this.xmin+w, this.ymin+h));
		} else if (d.x < 0 && d.y > 0) { // north-west quadrant
			maxRect = new Rectangle(L.point(this.xmax-w, this.ymin), L.point(this.xmax, this.ymin+h));
		} else if (d.x < 0 && d.y < 0) { // south-west quadrant
			maxRect = new Rectangle(L.point(this.xmax-w, this.ymax-h), L.point(this.xmax, this.ymax));
		} else if (d.x > 0 && d.y < 0) { // south-east quadrant
			maxRect = new Rectangle(L.point(this.xmin, this.ymax-h), L.point(this.xmin+w, this.ymax));
		}
		var intersection = maxRect.intersection(s);
		console.assert(intersection != undefined, "segment-rectangle intersection test failed");
		return [this.extend(maxRect.intersection(s)), intersection];
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
			// don't register intersection if it is in the beginning corner (TODO: why not?)
			if (p != undefined && !(p.x == s1.p1.x && p.y == s1.p1.y)) {
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

	length() {
		var dx = this.p2.x - this.p1.x;
		var dy = this.p2.y - this.p1.y;
		return (dx**2 + dy**2)**0.5;
	}
}

function coverLineWithRectangle(l, w, h, i1) {
	var rect = new Rectangle(l[i1], l[i1]);
	var segment;
	var intersection = undefined;
	var dist = 0;
	for (var i = i1+1; i < l.length && intersection == undefined; i++) {
		var grect = rect.extend(l[i]);
		segment = new Segment(l[i-1], l[i]);
		if (grect.isSmallerThan(w, h)) { // whole segment fits in rectangle [w,h]
			rect = grect;
		} else { // segment must be divided to fit in rectangle [w,h]
			[rect, intersection] = rect.extendBounded(segment, w, h); // create rectangle as big as possible in the direction of the segment
			segment = new Segment(l[i-1], intersection);
		}
		dist += segment.length();
	}
	rect = (new Rectangle(L.point(0, 0), L.point(w, h))).center(rect.middle);
	return [rect, i, intersection, dist];
}

function coverLineWithRectangles(l, w, h, mix) {
	var rects = [];
	var intersections = [];
	var i1 = 0;
	while (true) {
		var [rect, i2, intersection, dist] = coverLineWithRectangle(l, w, h, i1);
		if (mix) {
			var [recthw, i2hw, intersectionhw, disthw] = coverLineWithRectangle(l, h, w, i1);
			rect.rotated = false;
			if (disthw > dist) {
				[rect, i2, intersection, dist] = [recthw, i2hw, intersectionhw, disthw];
				rect.rotated = true;
			}
		}
		rects.push(rect);
		if (intersection == undefined) {
			break;
		}
		intersections.push(intersection);
		l.splice(i2, 0, intersection); // divide the segment TODO: don't modify input array
		i1 = i2;
	}
	return [rects, intersections];
}

// https://leafletjs.com/reference-0.7.7.html#icontrol
L.Control.PrintRouteControl = L.Control.extend({
	options: {
		position: "topleft",
	},

	initialize: function() {
		this.hasRoute = false;

		this.autoPages = true;

		this.imgDataUrls = [];

		this.setImageFormat("jpeg");
		this.setStrokeColor("gray");
		this.setFillColor("gray");

		// list paper sizes from https://en.wikipedia.org/wiki/Paper_size#Overview_of_ISO_paper_sizes
		this.paperSizes = [];
		for (var n = 0; n <= 6; n++) {
			var w = Math.floor(841  / 2**(n/2));
			var h = Math.floor(1189 / 2**(n/2));
			this.paperSizes.push({name: `A${n}`, width: w, height: h});
		}
		for (var n = 0; n <= 6; n++) {
			var w = Math.floor(1000 / 2**(n/2));
			var h = Math.floor(1414 / 2**(n/2));
			this.paperSizes.push({name: `B${n}`, width: w, height: h});
		}
	},

	onAdd: function(map) { // constructor
		this.map = map;

		// keep all rectangles in one group
		this.rectGroup = L.layerGroup();
		this.rectGroup.addTo(this.map);

		var divWrapper = createElement("div", {className: "leaflet-bar leaflet-control"}, {backgroundColor: "white"});
		L.DomEvent.disableClickPropagation(divWrapper);
		L.DomEvent.disableScrollPropagation(divWrapper);

		var divControls = createElement("div", {}, {borderSpacing: "5px"});
		var container = createElement("form", {className: "text-input"});

		this.inputScale = createElement("input", {id: "input-scale-world", type: "number", defaultValue: 100000}, {width: "6em"});
		this.inputDPI = createElement("span", {id: "input-dpi"}, {fontWeight: "bold"});
		var l = createElement("label", {innerHTML: "Scale:", for: this.inputScale.id});
		l.title = "Paper-to-World scale and resolution of the printed raster map in Dots Per Inch (DPI). The color of the DPI value indicates the expected print quality, from worst (0, red) to best (300, green). Hover on the labels below to see more help information.";
		l.style.cursor = "help";
		var p = createElement("p");
		p.append(l, "1 : ", this.inputScale, " (", this.inputDPI, ")");
		container.append(p);

		this.inputWidth = createElement("input", {id: "input-size-width", type: "number", defaultValue: 210}, {width: "3.5em"});
		this.inputHeight = createElement("input", {id: "input-size-height", type: "number", defaultValue: 297}, {width: "3.5em"});
		this.inputPreset  = createElement("select", {id: "input-size-preset"});
		this.inputPreset.append(new Option("-"));
		for (var paperSize of this.paperSizes) {
			this.inputPreset.append(new Option(paperSize.name));
        }
		l = createElement("label", {innerHTML: "Paper:", for: this.inputWidth.id + " " + this.inputHeight.id});
		l.title = "Physical paper size. Enter manually or select a preset (P = Portrait, L = Landscape).";
		l.style.cursor = "help";
		p = createElement("p");
		p.append(l, this.inputWidth, " mm x ", this.inputHeight, " mm = ", this.inputPreset);
		container.append(p);

		this.inputOrientation = createElement("select", {id: "input-orientation"});
		this.inputOrientation.append(new Option("Portrait"));
		this.inputOrientation.append(new Option("Landscape"));
		this.inputOrientation.append(new Option("Mix efficiently"));
		l = createElement("label", {innerHTML: "Orientation:", for: this.inputOrientation.id});
		p = createElement("p");
		p.append(l, this.inputOrientation);
		container.append(p);

		this.inputMargin = createElement("input", {id: "input-inset", type: "number", defaultValue: 10}, {width: "3em"});
		l = createElement("label", {innerHTML: "Margin:", for: this.inputMargin.id});
		l.title = "Enter a margin to require the route to be contained in a sequence of rectangles that are smaller than the paper. Useful for countering printer bleed, ensuring an overlap to make the route easier to follow across pages, and to ensure a minimum of contextual map area around the route.";
		l.style.cursor = "help";
		p = createElement("p");
		p.append(l, this.inputMargin, " mm ");
		container.append(p);

		this.inputPrint = createElement("input", {id: "input-print", type: "button", value: "Print"}, {display: "inline", fontWeight: "bold", backgroundColor: "limegreen", borderRadius: "5px", border: "none"});
		this.inputPrint.title = "Print the map as a PDF file and automatically open it when complete.";
		this.printStatus = createElement("span", {});
		this.inputPages = createElement("input", {id: "input-pages", type: "text"});
		this.inputPages.title = "Comma-separated list of (ranges of) pages to print. For example, \"1, 3-5, 7\" prints page 1, 3, 4, 5 and 7. Clear to reset to all pages.";
		this.inputPages.addEventListener("change", function() {
			this.autoPages = this.inputPages.value == ""; // if user clears the field, fill it automatically
			if (this.autoPages) {
				this.previewRoute(); // update this field
			}
		}.bind(this));
		this.inputPages.addEventListener("input", function() {
			this.inputPages.style.width = `${this.inputPages.value.length}ch`;
		}.bind(this));
		l = createElement("label", {}, {fontWeight: "normal"});
		l.append(" pages ", this.inputPages, this.printStatus);
		p = createElement("p");
		p.append(this.inputPrint, l);
		container.append(p);

		this.downloadLink = createElement("a", {"download": "route.pdf"}, {"display": "none"});
		container.append(this.downloadLink);

		divControls.append(container);

		// TODO: improve organization of wrapper, header, button, etc.

		var divButton = createElement("div", {}, {display: "flex", justifyContent: "space-between", borderBottom: "1px solid black"}); // float left and right using https://stackoverflow.com/a/10277235

		var header = createElement("p", {innerHTML: "<b>Print route settings</b>"}, {margin: "0", fontSize: "13px", padding: divControls.style.borderSpacing}); // padding should be same as borderSpacing in divControls
		var button = createElement("a", {innerHTML: "✖", href: "#"}, {display: "inline-block", width: "30px", height: "30px", lineHeight: "30px", fontSize: "22px"});
		var help = createElement("a", {innerHTML: "?", title: "You get what you see! Zoom the map to your preferred level of detail, modify these settings and hit Print. The color of the DPI value indicates the print quality.", href: "#"}, {display: "inline-block", width: "30px", height: "30px", lineHeight: "30px", fontSize: "22px", cursor: "help"});
		button.addEventListener("click", function() {
			if (divControls.style.display == "none") {
				divControls.style.display = "block";
				header.style.display = "block";
				button.innerHTML = "✖";
				help.style.display = "inline-block";
			} else {
				divControls.style.display = "none";
				header.style.display = "none";
				button.innerHTML = "P";
				help.style.display = "none";
			}
		});
		var buttonWrapper = createElement("div", {});
		buttonWrapper.append(help, button);
		divButton.append(header, buttonWrapper);

		divWrapper.append(divButton, divControls);

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
		this.inputOrientation.addEventListener("change", this.previewRoute.bind(this));
		this.inputMargin.addEventListener("change", this.previewRoute.bind(this));
		this.inputPrint.onclick = this.printRoute.bind(this);
		this.map.addEventListener("zoomend", this.previewRoute.bind(this));

		this.previewRoute(); // TODO: can i do this here after saving all input fields in the class?

		return divWrapper;
	},

	setPrintStatus: function(status) {
		this.printStatus.innerHTML = status == undefined ? "" : " " + status;
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

	scaleToDPI: function(sWorld) {
		var sPaper = 1;
		var sWorld = parseInt(this.inputScale.value);
		var wmmPaper = parseInt(this.inputWidth.value);
		var hmmPaper = parseInt(this.inputHeight.value);
		var paperToWorld = sPaper / sWorld;
		var worldToPaper = 1 / paperToWorld;
		var wmmWorld = wmmPaper * worldToPaper;
		var hmmWorld = hmmPaper * worldToPaper;

		var routeCenter = this.line.getCenter();
		var wpxWorld = metersToPixels(this.map, wmmWorld / 1000, routeCenter);
		var hpxWorld = metersToPixels(this.map, hmmWorld / 1000, routeCenter);

		var dpix = wpxWorld / (wmmPaper / 25.4);
		var dpiy = hpxWorld / (hmmPaper / 25.4);
		var dpi = (dpix + dpiy) / 2;
		return dpi;
	},

	DPIToScale: function(dpi) {
		var wmmPaper = parseInt(this.inputWidth.value);
		var hmmPaper = parseInt(this.inputHeight.value);
		var wpxWorld = dpi / 25.4 * wmmPaper;
		var hpxWorld = (hmmPaper / wmmPaper) * wpxWorld;
		var sWorldx = 1 * pixelsToMeters(this.map, wpxWorld, this.line.getCenter()) * 1000 / wmmPaper;
		var sWorldy = 1 * pixelsToMeters(this.map, hpxWorld, this.line.getCenter()) * 1000 / hmmPaper;
		var sWorld = (sWorldx + sWorldy) / 2;
		return sWorld;
	},

	modifyMapState: function() {
		var oldState = {
			width: this.map.getContainer().style.width,
			height: this.map.getContainer().style.height,
			printHandler: this.inputPrint.onclick,
			printBackgroundColor: this.inputPrint.style.backgroundColor,
		};

		this.map.removeLayer(this.rectGroup);

		this.inputPrint.value = "Abort";
		this.inputPrint.style.backgroundColor = "red";
		this.inputPrint.onclick = function () {
			this.abortFlag = true;
		}.bind(this);

		return oldState;
	},

	restoreMapState: function (state) {
		this.map.getContainer().style.width = state.width;
		this.map.getContainer().style.height = state.height;

		this.inputPrint.value = "Print";
		this.inputPrint.style.backgroundColor = state.printBackgroundColor;
		this.inputPrint.onclick = state.printHandler;

		this.map.invalidateSize();

		this.map.addLayer(this.rectGroup);
	},

	printRouteWrapper: async function(print) {
		// update paper size preset
		var w = this.inputWidth.value;
		var h = this.inputHeight.value;
		var i = this.paperSizes.findIndex(size => size.width == w && size.height == h);
		this.inputPreset.selectedIndex = i+1; // if i is -1, the index becomes 0 (free)
		var o = this.inputOrientation.value;
		if (o == "Landscape") { // swap width <-> height
			var wtmp = w;
			w = h;
			h = wtmp;
		}
		var mix = o == "Mix efficiently";

		this.setPrintStatus();

		if (!this.hasRoute) {
			return;
		}

		var sPaper = 1;
		var sWorld = parseInt(this.inputScale.value);
		var wmmPaper = parseInt(w);
		var hmmPaper = parseInt(h);
		var pmmPaper = parseInt(this.inputMargin.value);
		var paperToWorld = sPaper / sWorld;
		var worldToPaper = 1 / paperToWorld;
		var wmmWorld = wmmPaper * (sWorld / sPaper);
		var hmmWorld = hmmPaper * (sWorld / sPaper);
		var pmmWorld = pmmPaper * (sWorld / sPaper);

		var routeCenter = this.line.getCenter();
		var wpxWorld = metersToPixels(this.map, wmmWorld / 1000, routeCenter);
		var hpxWorld = metersToPixels(this.map, hmmWorld / 1000, routeCenter);
		var ppxWorld = metersToPixels(this.map, pmmWorld / 1000, routeCenter);

		var rects = this.getRouteRectangles(this.line.getLatLngs(), wpxWorld, hpxWorld, ppxWorld, mix);

		var dpi = Math.round(this.scaleToDPI(sWorld));
		this.inputDPI.innerHTML = `${dpi} DPI`;

		if (this.autoPages) {
			this.inputPages.value = `1-${rects.length}`;
		}
		this.inputPages.style.width = `${this.inputPages.value.length}ch`;
		// parse value
		var pages = [];
		var matches = this.inputPages.value.match(/\d+(-\d+)?/g);
		for (const match of matches) {
			var s = match.split("-");
			var p1 = parseInt(s[0]);
			var p2 = parseInt(s.length == 2 ? s[1] : s[0]);
			for (var p = p1; p <= p2; p++) {
				pages.push(p-1); // 0-index
			}
		}

		// indicate print quality with color
		var dpi1 = 0, hue1 = 0;     // horrible print quality  (red)
		var dpi2 = 300, hue2 = 140; // excellent print quality (green)
		var hue = Math.min(Math.floor((hue2 - hue1) * (dpi - dpi1) / (dpi2 - dpi1)), hue2); // restrict to hue2
		this.inputDPI.style.color = `hsl(${hue}, 100%, 50%)`;

		var dpi = Math.floor((wpxWorld / (wmmPaper / 25.4) + hpxWorld / (hmmPaper / 25.4)) / 2);
		this.setPrintStatus(`at ${Math.floor(wpxWorld)} x ${Math.floor(hpxWorld)} pixels`);

		if (print) {
			var printfunc = function() {
				if (!this.abortFlag) {
					var pdf;
					for (var i = 0; i < pages.length; i++) {
						var rect = rects[pages[i]];
						var w, h;
						// recognize mixed portrait/landscape rectangles
						if (mix && rect.rotated) {
							w = hmmPaper;
							h = wmmPaper;
						} else {
							w = wmmPaper;
							h = hmmPaper;
						}
						var orientation = w > h ? "landscape" : "portrait";
						if (i == 0) {
							// adding first page is the same as creating the PDF
							pdf = new jspdf.jsPDF({format: [w, h], orientation: orientation, compress: true});
							pdf.setFontSize(15);
						}  else {
							// add more pages
							pdf.addPage([w, h], orientation);
						}
						var img = this.imgDataUrls[i];
						pdf.addImage(img, this.imageFormat, 0, 0, w, h, undefined, "FAST");
						pdf.text("Printed with hersle.github.io/leaflet-route-print", 0+5, 0+5, {align: "left", baseline: "top"});
						pdf.text(`Page ${pages[i]+1} of ${rects.length}`, w-5, 0+5, {align: "right", baseline: "top"});
						pdf.text(`Scale ${sPaper} : ${sWorld}`, 0+5, h-5, {align: "left", baseline: "bottom"});
						var attrib = this.getAttribution();
						if (attrib) {
							pdf.text(attrib, w-5, h-5, {align: "right", baseline: "bottom"});
						}
					}
					// to decide download filename: https://stackoverflow.com/a/56923508/3527139
					var blob = pdf.output("blob", {filename: "route.pdf"});
					this.downloadLink.href = URL.createObjectURL(blob);
					this.downloadLink.click(); // download
				}

				this.restoreMapState(oldState);
				document.removeEventListener("printcomplete", printfunc);
				this.setPrintStatus(); // empty

				this.imgDataUrls = []; // reset for next printing
				this.abortFlag = false;
			}.bind(this);

			var oldState = this.modifyMapState();
			document.addEventListener("printcomplete", printfunc);

			this.printMap(rects, pages);
		}
	},

	getRouteRectangles: function(ll, w, h, p, mix) {
		if (ll.length == 0) {
			return;
		}
		var l = ll.slice(); // copy array (algorithm will modify it) TODO: don't modify
		for (var i = 0; i < l.length; i++) {
			l[i] = this.map.project(l[i]); // geo to pixel coords (so paper size becomes meaningful)
		}
		const [rects, intersections] = coverLineWithRectangles(l, w-2*p, h-2*p, mix);

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
		// show intersection points (only for debugging purposes)
		// TODO: print intersection points at page boundaries to easily "follow" the map
		// TODO: remove them completely
		if (DEBUG) {
			for (const p of intersections) {
				L.circleMarker(p, {radius: 5, stroke: false, color: "black", opacity: 1, fillOpacity: 1.0}).addTo(this.rectGroup);
			}
		}

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

	printMap: function(rects, pages) {
		var printRect = function(i) {
			var p = pages[i];
			this.setPrintStatus(`Downloading page ${p+1} of ${rects.length} ...`);

			if (i == pages.length) {
				this.enableInput();
				document.dispatchEvent(new Event("printcomplete"));
				return;
			}

			var r = rects[p];
			var w = r.width;
			var h = r.height;
			var c = this.map.unproject(r.middle);

			this.map.getContainer().style.width = `${w}px`;
			this.map.getContainer().style.height = `${h}px`;
			this.map.invalidateSize();
			this.map.setView(c, this.map.getZoom(), {animate: false});

			leafletImage(this.map, function(err, canvas) {
				if (this.abortFlag) {
					// when user clicks abort, this aborts the printing when it reaches the next page
					// TODO: find a way to abort immediately!
					this.enableInput();
					document.dispatchEvent(new Event("printcomplete"));
					return;
				}

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

		this.disableInput();
		printRect(0);
	},

	disableInput: function() {
		console.log("input disabled");
		this.map.boxZoom.disable();
		this.map.doubleClickZoom.disable();
		this.map.dragging.disable();
		this.map.keyboard.disable();
		this.map.scrollWheelZoom.disable();
		if (map.tapHold) this.map.tapHold.disable(); // specific to mobile Safari
		this.map.touchZoom.disable();
	},

	enableInput: function() {
		console.log("input enabled");
		this.map.boxZoom.enable();
		this.map.doubleClickZoom.enable();
		this.map.dragging.enable();
		this.map.keyboard.enable();
		this.map.scrollWheelZoom.enable();
		if (map.tapHold) this.map.tapHold.enable(); // specific to mobile Safari
		this.map.touchZoom.enable();
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
