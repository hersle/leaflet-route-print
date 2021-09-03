// map.getContainer().style will NOT return values set in stylesheet,
// so set them here instead
document.getElementById("map").style.width = "100vw";
document.getElementById("map").style.height = "100vh";

var map = L.map("map", {
	preferCanvas: true,
	zoomControl: false,
});

function createNamedTileLayer(name, tileURL, attribName, attribURL) {
	var tl = L.tileLayer(tileURL, {attribution: `© <a href="${attribURL}">${attribName}</a>`});
	tl.name = name;
	return tl;
}

L.Control.MiscSelector = L.Control.extend({
	options: {
		position: "topleft",
	},

	initialize: function(tileLayers) {
		this.tileLayers = tileLayers;
		this.currentTileLayer = undefined;
	},

	setTileLayer: function(tileLayer) {
		if (this.currentTileLayer != undefined) {
			map.removeLayer(this.currentTileLayer);
		}
		this.map.addLayer(tileLayer);
		this.currentTileLayer = tileLayer;
	},

	onAdd: function(map) {
		this.map = map;
		this.setTileLayer(this.tileLayers[0]);

		var container = L.DomUtil.create("form", "text-input leaflet-bar");
		container.style.backgroundColor = "white";
		container.style.padding = "0.5em";
		container.style.borderSpacing = "0.5em";
		L.DomEvent.disableClickPropagation(container);
		L.DomEvent.disableScrollPropagation(container);

		this.inputLayer = createElement("select", {id: "input-layer"});
		var l = createElement("label", {innerHTML: "Map Source", for: "input-layer"});
		for (var tl of this.tileLayers) {
			this.inputLayer.append(new Option(tl.name));
		}
		var p = createElement("p");
		p.append(l, this.inputLayer);
		container.append(p);

		this.inputLayer.addEventListener("change", function(event) {
			var tl = this.tileLayers.find(t => t.name == this.inputLayer.value);
			if (tl != undefined) {
				this.setTileLayer(tl);
			}
		}.bind(this));

		var inputRoute = createElement("input", {id: "input-routefile", type: "file", accept: ".gpx"}, {width: "13em"});
		var l = createElement("label", {innerHTML: "Route file:", for: inputRoute.id});
		var p = createElement("p");
		p.append(l, inputRoute);
		container.append(p);

		inputRoute.addEventListener("change", async function(event) {
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

		return container;
	},
});

var routePrinter = new L.Control.PrintRouteControl();
routePrinter.addTo(map);
routePrinter.setRoute(points);

map.addControl(new L.Control.MiscSelector([
	createNamedTileLayer("OpenStreetMap", "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", "OpenStreetMap contributors", "https://www.openstreetmap.org/copyright"),
	createNamedTileLayer("Norgeskart (bakgrunn)", "http://opencache.statkart.no/gatekeeper/gk/gk.open_gmaps?layers=norgeskart_bakgrunn&zoom={z}&x={x}&y={y}", "Kartverket", "https://www.kartverket.no"),
	createNamedTileLayer("Norgeskart (toporaster4)", "http://opencache.statkart.no/gatekeeper/gk/gk.open_gmaps?layers=toporaster4&zoom={z}&x={x}&y={y}", "Kartverket", "https://www.kartverket.no"),
	createNamedTileLayer("Norgeskart (topo4)", "http://opencache.statkart.no/gatekeeper/gk/gk.open_gmaps?layers=topo4&zoom={z}&x={x}&y={y}", "Kartverket", "https://www.kartverket.no"),
	createNamedTileLayer("Norgeskart (topo4 grå)", "http://opencache.statkart.no/gatekeeper/gk/gk.open_gmaps?layers=topo4graatone&zoom={z}&x={x}&y={y}", "Kartverket", "https://www.kartverket.no"),
]));
L.control.zoom().addTo(map);
L.control.scale({metric: true, imperial: false}).addTo(map);
