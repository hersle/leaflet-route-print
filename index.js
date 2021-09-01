// map.getContainer().style will NOT return values set in stylesheet,
// so set them here instead
document.getElementById("map").style.width = "100vw";
document.getElementById("map").style.height = "100vh";

var map = L.map("map", {
	preferCanvas: true,
	zoomControl: false,
});

var tl1 = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'});
tl1.name = "OpenStreetMap";
var tl2 = L.tileLayer('http://opencache.statkart.no/gatekeeper/gk/gk.open_gmaps?layers=norgeskart_bakgrunn&zoom={z}&x={x}&y={y}', {attribution: '© <a href="https://www.kartverket.no">Kartverket</a>'});
tl2.name = "Norgeskart (bakgrunn)";
var tl3 = L.tileLayer('http://opencache.statkart.no/gatekeeper/gk/gk.open_gmaps?layers=toporaster4&zoom={z}&x={x}&y={y}', {attribution: '© <a href="https://www.kartverket.no">Kartverket</a>'});
tl3.name = "Norgeskart (toporaster4)";
var tl4 = L.tileLayer('http://opencache.statkart.no/gatekeeper/gk/gk.open_gmaps?layers=topo4&zoom={z}&x={x}&y={y}', {attribution: '© <a href="https://www.kartverket.no">Kartverket</a>'});
tl4.name = "Norgeskart (topo4)";
var tl5 = L.tileLayer('http://opencache.statkart.no/gatekeeper/gk/gk.open_gmaps?layers=topo4graatone&zoom={z}&x={x}&y={y}', {attribution: '© <a href="https://www.kartverket.no">Kartverket</a>'});
tl5.name = "Norgeskart (topo4 grå)";
var tileLayers = [tl1, tl2, tl3, tl4, tl5];
tl1.addTo(map); // default tile layer
var currentBaseLayer = tl1;

L.Control.MiscSelector = L.Control.extend({
	options: {
		position: "topleft",
	},
	onAdd: function(map) {
		var container = L.DomUtil.create("form", "text-input leaflet-bar");
		container.style.backgroundColor = "white";
		container.style.padding = "0.5em";
		container.style.borderSpacing = "0.5em";
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
		var s1 = L.DomUtil.create("select");
		s1.id = "input-layer";
		l1.innerHTML = "Map source:";
		for (var tl of tileLayers) {
			s1.append(new Option(tl.name));
		}
		p1.append(l1, s1);
		container.append(p1);

		var p2 = L.DomUtil.create("p");
		var l2 = L.DomUtil.create("label");
		var i2 = L.DomUtil.create("input");
		i2.id = "input-routefile";
		i2.type = "file";
		i2.accept = ".gpx";
		i2.style.width = "13em";
		l2.innerHTML = "Route file:";
		l2.for = i2.id;
		p2.append(l2, i2);
		container.append(p2);

		i2.addEventListener("change", async function(event) {
			var file = this.files[0];
			var stream = file.stream();
			var reader = stream.getReader();
			const utf8Decoder = new TextDecoder("utf-8");
			var done = false;
			var newpoints = [];
			while (!done) {
				var res = await reader.read();
				done = res.done;
				var s = utf8Decoder.decode(res.value, {stream: true});
				var l = "";
				while (true) {
					var i = s.indexOf("\n");
					l += s.slice(0, i);
					if (i == -1) {
						break;
					} else {
						// have one newline, handle it
						var regex = /trkpt lat="([+-]?\d+(?:\.\d+)?)" lon="([+-]?\d+(?:\.\d+)?)"/; // match <trkpt lat="float" lon="float"
						var matches = l.match(regex);
						var rev = false;
						if (!matches || matches.length == 0) {
							// try lat="" lon"" instead
							regex = /trkpt lon="([+-]?\d+(?:\.\d+)?)" lat="([+-]?\d+(?:\.\d+)?)"/; // match <trkpt lat="float" lon="float"
							matches = l.match(regex);
							rev = true;
						}
						if (matches && matches.length == 3) { // have [fullmatch, lat, lon]
							if (rev) {
								newpoints.push([parseFloat(matches[2]), parseFloat(matches[1])]);
							} else {
								newpoints.push([parseFloat(matches[1]), parseFloat(matches[2])]);
							}
						}

						s = s.slice(i+1);
						l = "";
					}
				}
			}
			routePrinter.setRoute(newpoints);
		});
		s1.addEventListener("change", function(event) {
			var tl = tileLayers.find(t => t.name == document.getElementById("input-layer").value);
			if (tl != undefined) {
				map.removeLayer(currentBaseLayer);
				map.addLayer(tl);
				currentBaseLayer = tl;
			}
		});

		return container;
	},
});

var routePrinter = new L.Control.PrintRouteControl();
routePrinter.addTo(map);
routePrinter.setRoute(points);

map.addControl(new L.Control.MiscSelector());
L.control.zoom().addTo(map);
L.control.scale({metric: true, imperial: false}).addTo(map);
