// main.js

const map = L.map("map").setView([0, 0], 2);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/">OSM</a>'
}).addTo(map);

const colorPalette = ["#3b82f6", "#f97316", "#10b981", "#8b5cf6", "#ef4444", "#14b8a6"];
let feedCount = 0;
let globalRouteLayers = {};
let globalRouteColors = {};

const gtfsInput = document.getElementById("gtfs-upload");
gtfsInput.addEventListener("change", async (event) => {
    for (const file of event.target.files) {
        const feedId = `feed_${feedCount++}`;
        await handleGTFSFile(file, feedId);
    }
});

async function handleGTFSFile(file, feedId) {
    const zip = await JSZip.loadAsync(file);
    const required = ["stops.txt", "shapes.txt", "routes.txt", "agency.txt", "trips.txt", "stop_times.txt"];
    for (const name of required) {
        if (!zip.file(name)) return alert(`Missing ${name} in ${file.name}`);
    }

    const [stopsText, shapesText, routesText, agencyText, tripsText, stopTimesText] = await Promise.all([
        zip.file("stops.txt").async("string"),
        zip.file("shapes.txt").async("string"),
        zip.file("routes.txt").async("string"),
        zip.file("agency.txt").async("string"),
        zip.file("trips.txt").async("string"),
        zip.file("stop_times.txt").async("string")
    ]);

    const stops = parseCSV(stopsText);
    const shapes = parseCSV(shapesText);
    const routes = parseCSV(routesText);
    const agency = parseCSV(agencyText)[0];
    const trips = parseCSV(tripsText);
    const stopTimes = parseCSV(stopTimesText);

    const tripRouteMap = Object.fromEntries(trips.map(t => [t.trip_id, t.route_id]));
    const shapeToRouteMap = Object.fromEntries(trips.map(t => [t.shape_id, t.route_id]));

    const routeStops = {};
    for (const stopTime of stopTimes) {
        const routeId = tripRouteMap[stopTime.trip_id];
        if (!routeStops[routeId]) routeStops[routeId] = new Set();
        routeStops[routeId].add(stopTime.stop_id);
    }

    displayAgency(agency);
    displayRoutes(routes, shapes, stops, shapeToRouteMap, routeStops, feedId);
    console.log(routes);
}

function parseCSV(text) {
    const lines = text.trim().split("\n");
    const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ''));
    return lines.slice(1).map((line) => {
        const values = line.split(",").map(v => v.trim().replace(/^"|"$/g, ''));
        const obj = {};
        headers.forEach((h, i) => {
            obj[h] = values[i];
        });
        return obj;
    });
}

function displayAgency(agency) {
    const info = document.getElementById("agency-info");
    const block = document.createElement("div");
    block.innerHTML = `
    <div class="border-b border-gray-300 pb-2 mb-2">
      <strong>${agency.agency_name}</strong><br>
      ${agency.agency_url}<br>
      ${agency.agency_timezone}<br>
      ${agency.agency_phone || ""}
    </div>
  `;
    info.appendChild(block);
}

function displayRoutes(routes, shapes, stops, shapeToRouteMap, routeStops, feedId) {
    const shapeGroups = {};
    shapes.forEach((shape) => {
        const id = shape.shape_id;
        if (!shapeGroups[id]) shapeGroups[id] = [];
        shapeGroups[id].push({
            lat: parseFloat(shape.shape_pt_lat),
            lon: parseFloat(shape.shape_pt_lon),
            seq: parseInt(shape.shape_pt_sequence)
        });
    });

    const routesList = document.getElementById("routes-list");
    const allCoords = [];

    Object.entries(shapeGroups).forEach(([shapeId, points], index) => {
        const routeId = shapeToRouteMap[shapeId];
        if (!routeId) return;
        const route = routes.find(r => r.route_id === routeId);
        if (!route) return;

        points.sort((a, b) => a.seq - b.seq);
        const latlngs = points.map(pt => [pt.lat, pt.lon]);
        allCoords.push(...latlngs);

        const color =   isValidHexColor(route.route_color) ? `#${route.route_color}` : colorPalette[index % colorPalette.length];
        function isValidHexColor(color) {
            return /^([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/.test(color);
        }
        if (!globalRouteColors[feedId]) globalRouteColors[feedId] = {};
        globalRouteColors[feedId][routeId] = color;

        const polyline = L.polyline(latlngs, {
            color,
            weight: 5,
            opacity: 0.5
        }).addTo(map);

        const stopMarkers = [];
        if (routeStops[routeId]) {
            for (const stopId of routeStops[routeId]) {
                const stop = stops.find(s => s.stop_id === stopId);
                if (!stop) continue;
                const marker = L.circleMarker([+stop.stop_lat, +stop.stop_lon], {
                    radius: 2,
                    color,
                    fillOpacity: 0.4
                }).bindPopup(`<strong>${stop.stop_name}</strong><br>ID: ${stop.stop_id}`);
                marker.addTo(map);
                stopMarkers.push(marker);
                allCoords.push([+stop.stop_lat, +stop.stop_lon]);
            }
        }

        // If the feedId isn’t set yet, initialize it.
        if (!globalRouteLayers[feedId]) globalRouteLayers[feedId] = {};

        // Ensure that the route id has an entry with arrays.
        if (!globalRouteLayers[feedId][routeId]) {
            globalRouteLayers[feedId][routeId] = { polylines: [], stopMarkers: [] };
        }

        // Add the current polyline and markers.
        globalRouteLayers[feedId][routeId].polylines.push(polyline);
        globalRouteLayers[feedId][routeId].stopMarkers.push(...stopMarkers);

    });

    routes.forEach(route => {
        const routeColor = isValidHexColor(route.route_color) ? `#${route.route_color}` : "#000";
        function isValidHexColor(color) {
            return /^([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/.test(color);
        }

        const routeDiv = document.createElement("div");
        routeDiv.className = "border-l-4 pl-2 mb-1 cursor-pointer hover:bg-gray-100";
        routeDiv.style.borderColor = routeColor;

        routeDiv.innerHTML = `
            <div class="font-medium">${route.route_short_name || ""} ${route.route_long_name || ""}</div>
            <div class="text-xs text-gray-500">Route ID: ${route.route_id}</div>
        `;

        routeDiv.classList.add("bg-blue-100");
        routeDiv.dataset.routeId = route.route_id;
        routeDiv.dataset.feedId = feedId;
        
        routeDiv.addEventListener("click", () => {
            const { routeId, feedId } = routeDiv.dataset;
            const routeLayer = globalRouteLayers[feedId]?.[routeId];

            if (routeLayer) {
                // Check visibility using the first polyline (assuming all share the same state)
                const visible = map.hasLayer(routeLayer.polylines[0]);
                if (visible) {
                    // Remove every polyline and marker.
                    routeLayer.polylines.forEach(polyline => map.removeLayer(polyline));
                    routeLayer.stopMarkers.forEach(marker => map.removeLayer(marker));
                    routeDiv.classList.remove("bg-blue-100");
                } else {
                    // Add every polyline and marker.
                    routeLayer.polylines.forEach(polyline => polyline.addTo(map));
                    routeLayer.stopMarkers.forEach(marker => marker.addTo(map));
                    routeDiv.classList.add("bg-blue-100");
                }
            }
        });
        routesList.appendChild(routeDiv);
        const toggleButton = document.createElement("button");
        toggleButton.className = "mt-2 px-4 py-2 bg-gray-200 text-sm rounded hover:bg-gray-300";
        toggleButton.textContent = "Toggle All Routes";

        let allRoutesVisible = true;

        toggleButton.addEventListener("click", () => {
            allRoutesVisible = !allRoutesVisible;

            Object.values(globalRouteLayers[feedId] || {}).forEach(routeLayer => {
                if (allRoutesVisible) {
                    routeLayer.polylines.forEach(polyline => polyline.addTo(map));
                    routeLayer.stopMarkers.forEach(marker => marker.addTo(map));
                } else {
                    routeLayer.polylines.forEach(polyline => map.removeLayer(polyline));
                    routeLayer.stopMarkers.forEach(marker => map.removeLayer(marker));
                }
            });

            // Update the button text to reflect the current state
            toggleButton.textContent = allRoutesVisible ? "Hide All Routes" : "Show All Routes";
        });

        routesList.appendChild(toggleButton);
    });

    if (allCoords.length > 0) {
        const bounds = L.latLngBounds(allCoords);
        map.fitBounds(bounds);
    }
}
