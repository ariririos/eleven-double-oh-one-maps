/* global L, proj4, jenks, colorbrewer */
let mapboxToken = "pk.eyJ1IjoicmlvYzA3MTkiLCJhIjoiY2sydTA3NmlsMWgydDNtbWJueDczNTVyYSJ9.OXt2qQjXDCMVpDZA5pf3gw";

const propAliases = {
    blkGrpMedianIncome: "nhgis0021_ds233_20175_2017_blck_grp_csv_AH1PE001",
    blkGrpPerCapitaIncome: "nhgis0021_ds233_20175_2017_blck_grp_csv_AH2RE001",
    blkRenterTenure: "nhgis0012_ds172_2010_block.csv.IFO004"
}

let map = L.map('map', {
    center: [42.310201212240266, -71.10151872038841], // Boston
    zoom: 12 // approx bounded by I-95
});

let dark = L.tileLayer("http://api.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={mapboxToken}", { id: 'mapbox.light', mapboxToken });
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

async function createChloroplethLayer(geojson, propName, colorSchemeName, project) {

    let moddedGeojson = {
        type: geojson.type,
        crs: geojson.crs,
        features: project ? projectFeaturesToWGS84(geojson.features) : geojson.features
    }

    // const perCapitaPopulationName = propAliases.totalPopBlock;
    // const perCapita = true;
    const featPropGetter = feat => feat.properties[propName];
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

    let onEachFeature = (feature, layer) => layer.bindPopup(`Property value: ${featPropGetter(feature)}, maps to color ${polygonIdsByColor[feature.id]}`);

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


    return L.geoJSON(moddedGeojson, { style, onEachFeature });
}

async function createAndAddChloroplethLayer(jsonPath, propName, colorSchemeName, project, addToMap, mapInst) {
    let data = await fetch(jsonPath);
    let geojson = await data.json()
    let chloroplethLayer = await createChloroplethLayer(geojson, propName, colorSchemeName, project);
    if (addToMap) chloroplethLayer.addTo(mapInst);
    return chloroplethLayer;
}

async function main() {
    let layerData = {
        blkGrpMedianIncome: ['data/MA_blck_grp_2017_intersect.geojson', propAliases.blkGrpMedianIncome, 'Greys', false, false],
        central: ['data/CentralSelection.geojson', propAliases.blkRenterTenure, 'RdPu', true, true],
        porter: ['data/PorterSelection.geojson', propAliases.blkRenterTenure, 'RdPu', true, true],
    };

    let layers = Object.assign({}, Object.fromEntries(Object.values(layerData).map(key => [key])));

    for (let [name, data] of Object.entries(layerData)) {
        layers[name] = await createAndAddChloroplethLayer(...data, map);
    }

    let baseMap = L.layerGroup();
    baseMap.addTo(map);

    L.control.scale().addTo(map);

    L.control.layers(
        // basemaps:
        { "Base map only": baseMap, "Median income by block group": layers.blkGrpMedianIncome },
        // overlays:
        { "Central": layers.central, "Porter": layers.porter }
    ).addTo(map);

    map.on('baselayerchange', e => {
        if (e.layer.bringToBack) e.layer.bringToBack();
    });

    map.flyTo([42.37539336229674, -71.11111767590047], 14, { duration: 3 }); // over Cambridge
}

main();