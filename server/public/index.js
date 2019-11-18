/* global L, proj4, jenks, colorbrewer */
let mapboxToken = "pk.eyJ1IjoicmlvYzA3MTkiLCJhIjoiY2sydTA3NmlsMWgydDNtbWJueDczNTVyYSJ9.OXt2qQjXDCMVpDZA5pf3gw";

const propAliases = {
    blkGrpMedianIncome: "nhgis0021_ds233_20175_2017_blck_grp_csv_AH1PE001",
    blkGrpPerCapitaIncome: "nhgis0021_ds233_20175_2017_blck_grp_csv_AH2RE001",
    blkRenterTenure: "nhgis0012_ds172_2010_block.csv.IFO004",
    blkPop: "nhgis0019_ds172_2010_block.csv.H7V001"
}

let map = L.map('map', {
    center: [42.310201212240266, -71.10151872038841], // Boston
    zoom: 12 // approx bounded by I-95
});

let dark = L.tileLayer("https://api.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={mapboxToken}", { id: 'mapbox.light', mapboxToken });
dark.addTo(map);

function projectFeaturesToWGS84(features) {
    // FIXME: not dealing with multipolygons here
    return features.filter(feat => feat.geometry.type == "Polygon").map(feat => {
        let featCopy = Object.assign(feat);
        featCopy.geometry.coordinates = [feat.geometry.coordinates[0].map(coordPair => {
            let firstProj = "+proj=aea +lat_1=29.5 +lat_2=45.5 +lat_0=37.5 +lon_0=-96 +x_0=0 +y_0=0 +ellps=GRS80 +datum=NAD83 +units=m no_defs";
            let secondProj = "WGS84";
            return proj4(firstProj, secondProj, coordPair);
        })];
        return featCopy;
    });
}

async function createChloroplethLayer(geojson, shortPropName, longPropName, colorSchemeName, project) {

    let moddedGeojson = {
        type: geojson.type,
        crs: geojson.crs,
        features: project ? projectFeaturesToWGS84(geojson.features) : geojson.features
    }

    // const perCapitaPopulationName = propAliases.totalPopBlock;
    // const perCapita = true;
    const featPropGetter = feat => feat.properties[shortPropName];
    // const featPropGetter = feat => {
    //     if (perCapita) return (feat.properties[chloroplethPropName] / feat.properties[perCapitaPopulationName]) || 0;
    //     else return feat.properties[chloroplethPropName];
    // };

    let propValues = moddedGeojson.features.map(feat => featPropGetter(feat)).filter(x => x != null);
    let propClasses = jenks(propValues, 5);
    // FIXME: some sort of off-by-one error in the coloring here
    let getColorForPolygon = v => {
        let colorBracket = 0;
        for (let i = 0; i < propClasses.length; i++) {
            if (v >= propClasses[i]) colorBracket = i;
        }
        return colorbrewer[colorSchemeName][5][colorBracket];
    };
    let polygonIdsByColor = moddedGeojson.features.reduce((acc, feat) => {
        acc[feat.id] = getColorForPolygon(featPropGetter(feat));
        return acc;
    }, {});

    let style = feature => ({
        fillColor: polygonIdsByColor[feature.id],
        weight: 2,
        fillOpacity: 0.5
    });

    let onEachFeature = (feature, layer) => layer.bindPopup(`${longPropName}: ${featPropGetter(feature)}`);

    // legend

    // TODO: add titles for layers
    // TODO: make it update when we turn layers on and off
    // FIXME: should prob move this out of this function if we're making it update with different layers
    // let legend = L.control({ position: "bottomright" });
    // legend.onAdd = () => {
    //     let div = L.DomUtil.create("div", "info legend");
    //     for (let i = 1; i < propClasses.length; i++) {
    //         div.innerHTML += `<div><i style="background: ${getColorForPolygon(propClasses[i])}"></i>${propClasses[i]}${propClasses[i+1] ? "-" + propClasses[i+1] + "<br>": "+"}</div>`.trim();
    //     }
    //     return div;
    // }
    // legend.addTo(map);


    return {
        layer: L.geoJSON(moddedGeojson, { style, onEachFeature }),
        colors: {
            propClasses,
            polygonIdsByColor,
            getColorForPolygon
        }
    }
}

async function createAndAddChloroplethLayer(jsonPath, shortPropName, longPropName, colorSchemeName, project, addToMap, mapInst) {
    let data = await fetch(jsonPath);
    let geojson = await data.json()
    let chloropleth = await createChloroplethLayer(geojson, shortPropName, longPropName, colorSchemeName, project);
    if (addToMap) chloropleth.layer.addTo(mapInst);
    return chloropleth;
}

async function createPointLayer(geojson, color, project, filterFn) {
    let moddedGeojson = {
        type: geojson.type,
        crs: geojson.crs,
        features: project ? projectFeaturesToWGS84(geojson.features) : geojson.features.filter(filterFn)
    }

    return {
        layer: L.geoJSON(moddedGeojson, { pointToLayer: (point, latlng) =>  L.circleMarker(latlng, { radius: 3, color, weight: 1 }) }),
        color
    }
}

async function createAndAddPointLayer(jsonPath, color, project, filterFn, addToMap, mapInst) {
    let data = await fetch(jsonPath);
    let geojson = await data.json();
    let point = await createPointLayer(geojson, color, project, filterFn);
    if (addToMap) point.layer.addTo(mapInst);
    return point;
}

// function isMarkerInsidePolygon(marker, poly) {
//     let polyPoints = poly.getLatLngs();
//     let x = marker.getLatLng().lat, y = marker.getLatLng().lng;

//     let inside = false;
//     for (let i = 0, j = polyPoints.length - 1; i < polyPoints.length; j = i++) {
//         let xi = polyPoints[i].lat, yi = polyPoints[i].lng;
//         let xj = polyPoints[j].lat, yj = polyPoints[j].lng;

//         let intersect = ((yi > y) != (yj > y))
//             && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
//         if (intersect) inside = !inside;
//     }

//     return inside;
// }

async function main() {
    const layerAliases = {
        blkGrpMedianIncome: "Median household income in by block group, Cambridge and Somerville",
        // centralMedianIncome: "Median household income in 2017 by block, Central",
        // porterMedianIncome: "Median household income in 2017 by block, Porter",
        trees: "(some) Trees",
        centralPop: "Total population, Central",
        porterPop: "Total population, Porter",
        centralRenters: "Renter-occupied housing units per block, Central",
        porterRenters: "Renter-occupied housing units per block, Porter"
    }

    let chloroLayersData = {
        blkGrpMedianIncome: ['data/MA_blck_grp_2017_intersect.geojson', propAliases.blkGrpMedianIncome, 'Median income', 'Greys', false, false],
        // centralMedianIncome: ['data/CentralSelection.geojson', propAliases.blkRenterTenure, 'Median income', 'RdPu', true, true],
        // porterMedianIncome: ['data/PorterSelection.geojson', propAliases.blkRenterTenure, 'Median income', 'RdPu', true, true],
        centralPop: ['data/CentralSelection.geojson', propAliases.blkPop, 'Population', 'RdPu', true, false],
        porterPop: ['data/PorterSelection.geojson', propAliases.blkPop, 'Population', 'RdPu', true, false],
        centralRenters: ['data/CentralSelection.geojson', propAliases.blkRenterTenure, 'Renter-occupied housing units', 'PuBu', true, true],
        porterRenters: ['data/PorterSelection.geojson', propAliases.blkRenterTenure, 'Renter-occupied housing units', 'PuBu', true, true]
    };

    let chloroLayers = Object.assign({}, Object.fromEntries(Object.keys(chloroLayersData).map(key => [key])));

    for (let [name, data] of Object.entries(chloroLayersData)) {
        chloroLayers[name] = await createAndAddChloroplethLayer(...data, map);
    }

    // FIXME: filter trees
    let pointLayersData = {
        trees: ['data/ENVIRONMENTAL_StreetTrees.geojson', 'green', false, ((p, i) => i % 500 == 0), true]
    };

    let pointLayers = Object.assign({}, Object.fromEntries(Object.keys(pointLayersData).map(key => [key])));

    for (let [name, data] of Object.entries(pointLayersData)) {
        pointLayers[name] = await createAndAddPointLayer(...data, map);
    }

    let baseMap = L.layerGroup();
    baseMap.addTo(map);

    L.control.scale().addTo(map);

    L.control.layers(
        // basemaps:
        {
            "Base map only": baseMap,
            [layerAliases.blkGrpMedianIncome]: chloroLayers.blkGrpMedianIncome.layer
        },
        // overlays:
        {
            // [layerAliases.centralMedianIncome]: chloroLayers.centralMedianIncome.layer,
            // [layerAliases.porterMedianIncome]: chloroLayers.porterMedianIncome.layer,
            [layerAliases.trees]: pointLayers.trees.layer,
            [layerAliases.centralPop]: chloroLayers.centralPop.layer,
            [layerAliases.porterPop]: chloroLayers.porterPop.layer,
            [layerAliases.centralRenters]: chloroLayers.centralRenters.layer,
            [layerAliases.porterRenters]: chloroLayers.porterRenters.layer,
        }
    ).addTo(map);

    // FIXME: legends for base layers
    map.on('baselayerchange', e => {
        if (e.layer.bringToBack) e.layer.bringToBack();
    });

    // Legends per layer:

    let legends = Object.assign({}, Object.fromEntries(Object.keys(chloroLayersData).map(key => [key])), Object.fromEntries(Object.keys(pointLayersData).map(key => [key])));

    // Chloropleth legends
    // eslint-disable-next-line require-atomic-updates
    for (let [name, chloro] of Object.entries(chloroLayers)) {
        let legend = L.control({ position: 'bottomright' });
        legend.onAdd = () => {
            let div = L.DomUtil.create('div', 'info legend');
            div.onclick = () => {
                map.flyToBounds(chloro.layer.getBounds());
            }
            let colors = chloro.colors;
            div.innerHTML += `<div>${layerAliases[name]}<br/></div>`;
            for (let i = 1; i < colors.propClasses.length; i++) {
                div.innerHTML += `<div><i style="background: ${colors.getColorForPolygon(colors.propClasses[i])}"></i>${colors.propClasses[i]}${colors.propClasses[i+1] ? "-" + colors.propClasses[i+1] + "<br>": "+"}</div>`.trim();
            }
            return div;
        }
        legends[name] = legend;
    }

    // Point layer legends
    // eslint-disable-next-line require-atomic-updates
    for (let [name, point] of Object.entries(pointLayers)) {
        let legend = L.control({ position: 'bottomright' });
        legend.onAdd = () => {
            let div = L.DomUtil.create('div', 'info legend');
            div.onclick = () => {
                map.flyToBounds(point.layer.getBounds());
            }
            div.innerHTML += `<div><i style="background: ${point.color}"></i>${layerAliases[name]}</div>`.trim();
            return div;
        }
        legends[name] = legend;
    }

    // Enable legends for all layers active at start
    for (let [name, data] of Object.entries(chloroLayersData)) {
        if (data.slice(-1)[0]) { // if map displayed at start
            legends[name].addTo(map);
        }
    }

    for (let [name, data] of Object.entries(pointLayersData)) {
        if (data.slice(-1)[0]) { // if map displayed at start
            legends[name].addTo(map);
        }
    }

    map.on('overlayadd', function(e) {
        map.flyToBounds(e.layer.getBounds());
        let shortName = Object.entries(layerAliases).find(([k, v]) => v === e.name)[0];
        legends[shortName].addTo(this);
    });

    map.on('overlayremove', function(e) {
        let shortName = Object.entries(layerAliases).find(([k, v]) => v === e.name)[0];
        this.removeControl(legends[shortName]);
    });

    map.flyTo([42.37539336229674, -71.11111767590047], 14, { duration: 3 }); // over Cambridge
}

main();