# Leaflet-route-print

**leaflet-route-print** is a [Leaflet](https://leafletjs.com/)-plugin to print routes. It features an algorithm that finds a sequence of rectangles of a given size that fully cover the route and automatically prints them to a PDF file.

## Demonstration

Visit [hersle.github.io/leaflet-route-print](https://hersle.github.io/leaflet-route-print/) or clone and run

```console
./demo.sh
```

## Usage and documentation

```javascript
import * as L from "./leaflet.js";
import "./leaflet-route-print.js";

// Initialize and configure map
var map = L.map("map");
...

// Create route printing control and add it to the map
var routePrinter = new L.Control.PrintRouteControl();
routePrinter.addTo(map);

// Set the Leaflet Polyline to print
// IMPORTANT: elements to be included in the print must be rendered with Leaflet's Canvas renderer!
var line = L.polyline(..., {renderer: L.canvas()});
routePrinter.setRoute(line);

// Set the format of images in the generated PDF
routePrinter.setImageFormat("jpeg"); // very good quality, low file size (default)
routePrinter.setImageFormat("png");  // lossless quality, high file size

// Set the color and opacity of rectangles in the map that show the pages that will be printed
routePrinter.setFillColor("gray", 0.2);   // (default)
routePrinter.setStrokeColor("gray", 1.0); // (default)
```
