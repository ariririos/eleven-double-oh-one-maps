/* global L, proj4, jenks, colorbrewer */
let mapboxToken = "pk.eyJ1IjoicmlvYzA3MTkiLCJhIjoiY2sydTA3NmlsMWgydDNtbWJueDczNTVyYSJ9.OXt2qQjXDCMVpDZA5pf3gw";

const propAliases = {
    // block group aliases
    blkGrpPop: "AHY1E001",
    blkGrpMedianIncome: "AH1PE001",
    blkGrpPerCapitaIncome: "AH2RE001",
    blkGrpMedianRent: "AH5RE001",
    blkGrpMedianRentPercentIncome: "AH5YE001",
    blkGrpMeanROWWidths: "ROW_Width",
    // block aliases
    blkPop: "H7V001",
    blkRenters: "IFF004",
    blkFamilies: "H8C002",
    blkMeanROWWidths: "ROW_Width",
    blkTrees: "TreeCount",
    blkLights: "LightCount"
};

const layerAliases = {
    // block group data
    centralMedianIncome: "Median household income in 2017 by block group, Central",
    porterMedianIncome: "Median household income in 2017 by block group, Porter",
    centralPerCapitaIncome: "Per capita household income in 2017 by block group, Central",
    porterPerCapitaIncome: "Per capita household income in 2017 by block group, Porter",
    centralMedianRent: "Median gross rent by block group, Central",
    porterMedianRent: "Median gross rent by block group, Porter",
    centralMedianRentPercentIncome: "Median gross rent as a % of annual household income by block group, Central",
    porterMedianRentPercentIncome: "Median gross rent as a % of annual household income by block group, Porter",
    centralPopBlockGroup: "Total population by block group, Central",
    porterPopBlockGroup: "Total population by block group, Porter",
    centralMeanROWWidthsBlockGroup: "Mean Right of Way (ROW) Widths by block group, Central",
    porterMeanROWWidthsBlockGroup: "Mean Right of Way (ROW) Widths by block group, Porter",
    // block data
    centralPopBlock: "Total population by block, Central",
    porterPopBlock: "Total population by block, Porter",
    centralRenters: "Renter-occupied housing units per block, Central",
    porterRenters: "Renter-occupied housing units per block, Porter",
    centralFamilies: "Family households per block, Central",
    porterFamilies: "Family households per block, Porter",
    centralMeanROWWidthsBlock: "Mean Right of Way (ROW) Widths by block, Central",
    porterMeanROWWidthsBlock: "Mean Right of Way (ROW) Widths by block, Porter",
    centralTrees: "Trees per block, Central",
    porterTrees: "Trees per block, Porter",
    centralLights: "Streetlights per block, Central",
    porterLights: "Streetlights per block, Porter"
};

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
    console.log(shortPropName, propClasses);
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

async function main() {

    let chloroLayersData = {
        'data/combo/MA_blck_grp_2017_Central.geojson': {
            [propAliases.blkGrpPop]: {
                legendName: layerAliases.centralPopBlockGroup,
                longName: 'Total population',
                addToMap: false
            },
            [propAliases.blkGrpMedianIncome]: {
                legendName: layerAliases.centralMedianIncome,
                longName: 'Median income',
                addToMap: false
            },
            [propAliases.blkGrpPerCapitaIncome]: {
                legendName: layerAliases.centralPerCapitaIncome,
                longName: 'Per-capita income',
                addToMap: false
            },
            [propAliases.blkGrpMedianRent]: {
                legendName: layerAliases.centralMedianRent,
                longName: 'Median gross rent',
                addToMap: false
            },
            [propAliases.blkGrpMedianRentPercentIncome]: {
                legendName: layerAliases.centralMedianRentPercentIncome,
                longName: 'Median gross rent as a % of income',
                addToMap: false
            },
            [propAliases.blkGrpMeanROWWidths]: {
                legendName: layerAliases.centralMeanROWWidthsBlockGroup,
                longName: 'Mean ROW width',
                addToMap: false,
                colorScheme: 'YlGn'
            }
        },
        'data/combo/MA_blck_grp_2017_Porter.geojson': {
            [propAliases.blkGrpPop]: {
                legendName: layerAliases.porterPopBlockGroup,
                longName: 'Total population',
                addToMap: false
            },
            [propAliases.blkGrpMedianIncome]: {
                legendName: layerAliases.porterMedianIncome,
                longName: 'Median income',
                addToMap: false
            },
            [propAliases.blkGrpPerCapitaIncome]: {
                legendName: layerAliases.porterPerCapitaIncome,
                longName: 'Per-capita income',
                addToMap: false
            },
            [propAliases.blkGrpMedianRent]: {
                legendName: layerAliases.porterMedianRent,
                longName: 'Median gross rent',
                addToMap: false
            },
            [propAliases.blkGrpMedianRentPercentIncome]: {
                legendName: layerAliases.porterMedianRentPercentIncome,
                longName: 'Median gross rent as a % of income',
                addToMap: false
            },
            [propAliases.blkGrpMeanROWWidths]: {
                legendName: layerAliases.porterMeanROWWidthsBlockGroup,
                longName: 'Mean ROW width',
                addToMap: false,
                colorScheme: 'YlGn'
            }
        },
        'data/combo/CentralSelection.geojson': {
            [propAliases.blkPop]: {
                legendName: layerAliases.centralPopBlock,
                longName: 'Total population',
                addToMap: false
            },
            [propAliases.blkRenters]: {
                legendName: layerAliases.centralRenters,
                longName: 'Renter-occupied housing units',
                addToMap: true
            },
            [propAliases.blkFamilies]: {
                legendName: layerAliases.centralFamilies,
                longName: 'Family households',
                addToMap: false
            },
            [propAliases.blkTrees]: {
                legendName: layerAliases.centralTrees,
                longName: 'Trees',
                addToMap: false
            },
            [propAliases.blkLights]: {
                legendName: layerAliases.centralLights,
                longName: 'Streetlights',
                addToMap: false
            },
            [propAliases.blkMeanROWWidths]: {
                legendName: layerAliases.centralMeanROWWidthsBlock,
                longName: 'Mean ROW width',
                addToMap: false,
                colorScheme: 'YlGn'
            }
        },
        'data/combo/PorterSelection.geojson': {
            [propAliases.blkPop]: {
                legendName: layerAliases.porterPopBlock,
                longName: 'Total population',
                addToMap: false
            },
            [propAliases.blkRenters]: {
                legendName: layerAliases.porterRenters,
                longName: 'Renter-occupied housing units',
                addToMap: true
            },
            [propAliases.blkFamilies]: {
                legendName: layerAliases.porterFamilies,
                longName: 'Family households',
                addToMap: false
            },
            [propAliases.blkTrees]: {
                legendName: layerAliases.porterTrees,
                longName: 'Trees',
                addToMap: false
            },
            [propAliases.blkLights]: {
                legendName: layerAliases.porterLights,
                longName: 'Streetlights',
                addToMap: false
            },
            [propAliases.blkMeanROWWidths]: {
                legendName: layerAliases.porterMeanROWWidthsBlock,
                longName: 'Mean ROW width',
                addToMap: false,
                colorScheme: 'YlGn'
            }
        }
    };

    let chloroLayers = Object.assign({}, Object.fromEntries(Object.keys(chloroLayersData).map(key => [key])));

    for (let [path, layers] of Object.entries(chloroLayersData)) {
        chloroLayers[path] = {};
        for (let [layerPropName, layerOpts] of Object.entries(layers)) {
            chloroLayers[path][layerOpts.legendName] = await createAndAddChloroplethLayer(
                                                                path,
                                                                layerPropName,
                                                                layerOpts.longName,
                                                                layerOpts.colorScheme || 'RdPu',
                                                                false,
                                                                layerOpts.addToMap,
                                                                map
                                                             );
        }
    }

    // FIXME: filter trees
    // let pointLayersData = {
    //     // trees: ['data/ENVIRONMENTAL_StreetTrees.geojson', 'green', false, ((p, i) => i % 500 == 0), true]
    // };

    // let pointLayers = Object.assign({}, Object.fromEntries(Object.keys(pointLayersData).map(key => [key])));

    // for (let [name, data] of Object.entries(pointLayersData)) {
    //     pointLayers[name] = await createAndAddPointLayer(...data, map);
    // }

    let baseMap = L.layerGroup();
    baseMap.addTo(map);

    L.control.scale().addTo(map);

    let overlays = {};

    for (let path of Object.values(chloroLayers)) {
        for (let [legendName, layerData] of Object.entries(path)) {
            overlays[legendName] = layerData.layer;
        }
    }

    L.control.layers(
        // basemaps:
        {
            "Base map only": baseMap,
            // [layerAliases.blkGrpMedianIncome]: chloroLayers.blkGrpMedianIncomeCentral.layer
        },
        overlays
    ).addTo(map);

    // FIXME: legends for base layers
    map.on('baselayerchange', e => {
        if (e.layer.bringToBack) e.layer.bringToBack();
    });

    // Legends per layer:

    let legends = Object.assign({}, Object.fromEntries(Object.keys(chloroLayersData).map(key => [key])));//, Object.fromEntries(Object.keys(pointLayersData).map(key => [key])));

    // Chloropleth legends
    // eslint-disable-next-line require-atomic-updates
    for (let path of Object.values(chloroLayers)) {
        for (let [legendName, layerData] of Object.entries(path)) {
            let legend = L.control({ position: 'bottomright' });
            legend.onAdd = () => {
                let div = L.DomUtil.create('div', 'info legend');
                div.onclick = () => {
                    map.flyToBounds(layerData.layer.getBounds());
                }
                let colors = layerData.colors;
                div.innerHTML += `<div>${legendName}<br/></div>`;
                for (let i = 1; i < colors.propClasses.length; i++) {
                    div.innerHTML += `<div><i style="background: ${colors.getColorForPolygon(colors.propClasses[i])}"></i>${colors.propClasses[i]}${colors.propClasses[i+1] ? "-" + colors.propClasses[i+1] + "<br>": "+"}</div>`.trim();
                }
                return div;
            }
            legends[legendName] = legend;
        }
    }

    // Point layer legends
    // eslint-disable-next-line require-atomic-updates
    // for (let [name, point] of Object.entries(pointLayers)) {
    //     let legend = L.control({ position: 'bottomright' });
    //     legend.onAdd = () => {
    //         let div = L.DomUtil.create('div', 'info legend');
    //         div.onclick = () => {
    //             map.flyToBounds(point.layer.getBounds());
    //         }
    //         div.innerHTML += `<div><i style="background: ${point.color}"></i>${layerAliases[name]}</div>`.trim();
    //         return div;
    //     }
    //     legends[name] = legend;
    // }

    // Enable legends for all layers active at start
    for (let path of Object.values(chloroLayersData)) {
        for (let [_, data] of Object.entries(path)) {
            if (data.addToMap) { // if map displayed at start
                legends[data.legendName].addTo(map);
            }
        }
    }

    // for (let [name, data] of Object.entries(pointLayersData)) {
    //     if (data.slice(-1)[0]) { // if map displayed at start
    //         legends[name].addTo(map);
    //     }
    // }

    map.on('overlayadd', function(e) {
        map.flyToBounds(e.layer.getBounds());
        legends[e.name].addTo(this);
    });

    map.on('overlayremove', function(e) {
        this.removeControl(legends[e.name]);
    });

    map.flyTo([42.37539336229674, -71.11111767590047], 14, { duration: 3 }); // over Cambridge
}

main();