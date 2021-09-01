function pixelsToMeters(pixels, pos) {
	// https://stackoverflow.com/questions/49122416/use-value-from-scale-bar-on-a-leaflet-map
	point1 = map.latLngToLayerPoint(pos).add(L.point(-pixels/2, 0));
	point2 = map.latLngToLayerPoint(pos).add(L.point(+pixels/2, 0));
	point1 = map.layerPointToLatLng(point1);
	point2 = map.layerPointToLatLng(point2);
	return point1.distanceTo(point2);
}

function metersToPixels(meters, pos) {
	return meters / pixelsToMeters(1, pos);
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

// TODO: (w,h) -> r as input
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
			var vs = s.displacement;
			var bigRect = rect.extendBounded(vs, w, h); // create rectangle as big as possible in the direction of the segment 
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
		this.imgDataUrls = [];
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
		this.line = L.polyline([]);
		this.line.addTo(map);

		// keep all rectangles in one group
		this.rectGroup = L.layerGroup();
		this.rectGroup.addTo(map);

		var div = L.DomUtil.create("div", "leaflet-bar");
		div.style.backgroundColor = "white";
		div.style.padding = "0.5em";
		var container = L.DomUtil.create("form", "text-input");
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
		var i1 = L.DomUtil.create("input");
		i1.id = "input-scale-world";
		i1.type = "number";
		i1.defaultValue = 100000;
		i1.style.width = "6em";
		l1.innerHTML = "Scale:";
		l1.for = i1.id;
		p1.append(l1, "1 : ", i1);
		container.append(p1);

		var p2 = L.DomUtil.create("p");
		var l2 = L.DomUtil.create("label");
		var i21 = L.DomUtil.create("input");
		var i22 = L.DomUtil.create("input");
		var s2  = L.DomUtil.create("select");
		i21.id = "input-size-width";
		i21.type = "number";
		i21.defaultValue = 210;
		i21.style.width = "3.5em";
		i22.id = "input-size-height";
		i22.type = "number";
		i22.defaultValue = 297;
		i22.style.width = "3.5em";
		s2.id = "input-size-preset";
		s2.append(new Option("free"));
		for (var paperSize of this.paperSizes) {
			s2.append(new Option(paperSize.name));
        }
		l2.innerHTML = "Paper:";
		l2.for = i21.id + " " + i21.id;
		p2.append(l2, i21, " mm x ", i22, " mm = ", s2);
		container.append(p2);

		var p4 = L.DomUtil.create("p");
		var l4 = L.DomUtil.create("label");
		var i4 = L.DomUtil.create("input");
		i4.id = "input-inset";
		i4.type = "number";
		i4.defaultValue = 10;
		i4.style.width = "3em";
		l4.innerHTML = "Margin:";
		l4.for = i4.id;
		p4.append(l4, i4, " mm ");
		container.append(p4);

		var b6  = L.DomUtil.create("input");
		var a6 = L.DomUtil.create("a");
		b6.id = "input-print";
		b6.type = "button";
		b6.value = "Print";
		b6.style.display = "inline";
		a6.id = "input-download";
		a6.style.display = "inline";
		a6.style.backgroundColor = "transparent";
		a6.style.marginLeft = "0.5em";
		
		div.append(container);
		div.append(b6, a6);
		div.style.borderSpacing = "0.5em";

		i1.addEventListener("input", this.previewRoute.bind(this));
		i21.addEventListener("input", this.previewRoute.bind(this));
		i22.addEventListener("input", this.previewRoute.bind(this));
		i21.addEventListener("input", this.onInputSizeChange);
		i22.addEventListener("input", this.onInputSizeChange);
		s2.addEventListener("input", function(event) {
			if (s2.selectedIndex > 0) { // 0 is "free"
				i21.value = this.paperSizes[s2.selectedIndex-1].width;
				i22.value = this.paperSizes[s2.selectedIndex-1].height;
				this.previewRoute();
			}
		}.bind(this));
		i4.addEventListener("input", this.previewRoute.bind(this));
		b6.addEventListener("click", this.printRoute.bind(this));

		// TODO: fix that this event listener results in complaints about line not being added to map yet, wtf?
		// map.addEventListener("zoomend", this.previewRoute.bind(this)); // just for updating DPI value TODO: remove/optimize

		// this.previewRoute(); // TODO: can i do this here after saving all input fields in the class?

		return div;
	},

	printRouteWrapper: async function(print) {
		// update paper size preset
		var w = document.getElementById("input-size-width").value;
		var h = document.getElementById("input-size-height").value;
		var i = this.paperSizes.findIndex(size => size.width == w && size.height == h);
		document.getElementById("input-size-preset").selectedIndex = i+1;

		document.getElementById("input-download").download = "";
		document.getElementById("input-download").href = "";
		document.getElementById("input-download").innerHTML = "";
		document.getElementById("input-download").style.color = "black";
		document.getElementById("input-download").style.textDecoration = "none";
		document.getElementById("input-download").style.cursor = "default";
		document.getElementById("input-download").style.pointerEvents = "none";

		var sPaper = 1;
		var sWorld = parseInt(document.getElementById("input-scale-world").value);
		var wmmPaper = parseInt(document.getElementById("input-size-width").value);
		var hmmPaper = parseInt(document.getElementById("input-size-height").value);
		var pmmPaper = parseInt(document.getElementById("input-inset").value);
		var paperToWorld = sPaper / sWorld;
		var worldToPaper = 1 / paperToWorld;
		var wmmWorld = wmmPaper * worldToPaper;
		var hmmWorld = hmmPaper * worldToPaper;
		var pmmWorld = pmmPaper * worldToPaper;

		var routeCenter = this.line.getCenter();
		var wpxWorld = metersToPixels(wmmWorld / 1000, routeCenter);
		var hpxWorld = metersToPixels(hmmWorld / 1000, routeCenter);
		var ppxWorld = metersToPixels(pmmWorld / 1000, routeCenter);

		var rects = this.getRouteRectangles(this.line.getLatLngs(), wpxWorld, hpxWorld, ppxWorld);

		var dpi = Math.floor((wpxWorld / (wmmPaper / 25.4) + hpxWorld / (hmmPaper / 25.4)) / 2);
		document.getElementById("input-download").innerHTML = `${rects.length} page${rects.length == 1 ? "" : "s"} of ${Math.floor(wpxWorld)} x ${Math.floor(hpxWorld)} pixels at`;
		var dpiSpan = document.createElement("span");
		dpiSpan.innerHTML = ` ${dpi} DPI`;
		dpiSpan.style.color = dpi >= 300 ? "green" : dpi >= 150 ? "orange" : "red";
		document.getElementById("input-download").appendChild(dpiSpan);

		if (print) {
			var printfunc = function() {
				var pdf = new jspdf.jsPDF({format: [wmmPaper, hmmPaper]});
				pdf.setFontSize(15);
				for (var i = 0; i < rects.length; i++) {
					var rect = rects[i];
					if (i > 0) {
						pdf.addPage([wmmPaper, hmmPaper]);
					}
					var img = this.imgDataUrls[i];
					pdf.addImage(img, "jpeg", 0, 0, wmmPaper, hmmPaper); // TODO: compress here, too?
					pdf.text("Printed with hersle.github.io/leaflet-route-print", 0+5, 0+5, {align: "left", baseline: "top"});
					pdf.text(`Page ${i+1} of ${rects.length}`, wmmPaper-5, 0+5, {align: "right", baseline: "top"});
					pdf.text(`Scale ${sPaper} : ${sWorld}`, 0+5, hmmPaper-5, {align: "left", baseline: "bottom"});
					pdf.text(currentBaseLayer.getAttribution().replace(/<[^>]*>/g, ""), wmmPaper-5, hmmPaper-5, {align: "right", baseline: "bottom"});
				}
				// to decide download filename: https://stackoverflow.com/a/56923508/3527139
				var blob = pdf.output("blob");
				var bytes = blob.size;
				var megabytes = (bytes / 1e6).toFixed(1); // 1 decimal
				var bloburl = URL.createObjectURL(blob);
				document.getElementById("input-download").download = "route.pdf"; // suggested filename in browser
				document.getElementById("input-download").innerHTML = `Download PDF (${megabytes} MB)`;
				document.getElementById("input-download").href = bloburl;
				document.getElementById("input-download").style.color = "blue";
				document.getElementById("input-download").style.textDecoration = "underline";
				document.getElementById("input-download").style.cursor = "pointer";
				document.getElementById("input-download").style.pointerEvents = "auto";
				document.getElementById("input-download").click(); // TODO: use link only as dummy?

				this.imgDataUrls = []; // reset for next printing

				map.getContainer().style.width = originalWidth;
				map.getContainer().style.height = originalHeight;
				map.invalidateSize();

				map.addLayer(this.rectGroup);
				document.removeEventListener("printcomplete", printfunc);
			}.bind(this);
			document.addEventListener("printcomplete", printfunc);

			map.removeLayer(this.rectGroup);

			var originalWidth = map.getContainer().style.width;
			var originalHeight = map.getContainer().style.height;

			this.printMap(rects);
		}
	},

	getRouteRectangles: function(ll, w, h, p) {
		if (ll.length == 0) {
			return;
		}
		var l = ll.slice(); // copy array (algorithm will modify it) TODO: don't modify
		for (var i = 0; i < l.length; i++) {
			l[i] = map.project(l[i]); // geo to pixel coords (so paper size becomes meaningful)
		}
		const [rects, intersections] = coverLineWithRectangles(l, w-2*p, h-2*p);

		// convert from pixel coordinates back to geographical coordinates
		// TODO: better to not convert yet?
		for (var i = 0; i < intersections.length; i++) {
			intersections[i] = map.unproject(intersections[i]);
		}
		this.rectGroup.clearLayers();
		for (var i = 0; i < rects.length; i++) {
			var smallRect = rects[i];
			var bigRect = smallRect.pad(p);

			smallRect = [map.unproject(smallRect.min), map.unproject(smallRect.max)];
			bigRect = [map.unproject(bigRect.min), map.unproject(bigRect.max)];

			L.rectangle(bigRect, {stroke: true, weight: 1, opacity: 1, color: "black", fillColor: "black", fillOpacity: 0.25}).addTo(this.rectGroup);
			L.rectangle(smallRect, {stroke: true, weight: 1, opacity: 1.0, fill: false, color: "gray"}).addTo(this.rectGroup);
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

	setRoute: function(points) {
		this.line.setLatLngs(points);
		map.fitBounds(this.line.getBounds());
		this.previewRoute();
	},

	printMap: function(rects) {
		var cont = document.getElementById("map");

		var printRect = function(i) {
			var a = document.getElementById("input-download");
			a.innerHTML = `Downloading page ${i+1} of ${rects.length} ...`;

			if (i == rects.length) {
				document.dispatchEvent(new Event("printcomplete"));
				return;
			}

			var r = rects[i];
			var w = r.width;
			var h = r.height;
			var c = map.unproject(r.middle);

			cont.style.width = `${w}px`;
			cont.style.height = `${h}px`;
			map.invalidateSize();
			map.setView(c, map.getZoom(), {animate: false});
			map.invalidateSize();

			leafletImage(map, function(err, canvas) {
				// make canvas background white, since jpeg does not support white background
				// https://stackoverflow.com/a/56085861/3527139
				var ctx = canvas.getContext("2d");
				ctx.globalCompositeOperation = 'destination-over';
				ctx.fillStyle = "white";
				ctx.fillRect(0, 0, canvas.width, canvas.height);

				this.imgDataUrls.push(canvas.toDataURL("image/jpeg")); // TODO: add options for format and quality
				printRect(i+1);
			}.bind(this));
		}.bind(this);

		printRect(0);
	}
});
