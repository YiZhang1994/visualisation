//initialize slider
$("#slider-range").slider({
    range: true,
    min: 1901,
    max: 2016,
    values: [1901, 2016]
});

$("#yearRange").val($("#slider-range").slider("values", 0) +
    " - " + $("#slider-range").slider("values", 1));


//initialize map
var map = L.map('map').setView([0, 0], 2);

//define markers (an array storing all markers on the map) and polygon (lines between markers)
var markers = [];
var polygon;

//add maplayer to the map div
L.tileLayer('http://{s}.tiles.wmflabs.org/bw-mapnik/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);


//load data files, latLon_byCountryCode.csv and laureates.json, countries2.geo.json (world countries data from online), prizes.json
d3.queue()
    .defer(d3.csv, "data/latLon_byCountryCode.csv")
    .defer(d3.json, "data/laureates.json")
    .defer(d3.json, "data/countries2.geo.json")
    .defer(d3.json, "data/prizes.json")
    .await(combine);

/**
* combine laureates with country coordinates. Add coordinates to each laureate by matching bornCountryCode with country in latLon_byCountryCode.csv
*  combine firstname and surname as a new attribute "name"
* deal with worldData (draw choropleth map) and prizes data (for numbers of laureates in years ananlysis)
*/

function combine(error, latLon_byCountryCode, laureates, worldData, prizes) {
    if(error) {
        console.log(error);
    }
    //store arrays of laureates into laureatesArray
    var laureatesArray = laureates.laureates;

    //link two data set together, adding coordinates to laureates
    laureatesArray.forEach(function(laureate) {
        var result = latLon_byCountryCode.filter(function(country) {
            return country.country === laureate.bornCountryCode;
        });
        laureate.latitude = (result[0] !== undefined) ? Number(result[0].latitude) : null;
        laureate.longitude = (result[0] !== undefined) ? Number(result[0].longitude) : null;
        laureate.name = laureate.firstname + " "+ laureate.surname;
        delete laureate.firstname;
        delete laureate.surname;
    });

    // default value of minYear and maxYear
    var minYear = 1901;
    var maxYear = 2016;

    // show default markers of all laureates on the map
    showLaureateMarkers(laureatesArray, minYear, maxYear);

    //show laureates count per country, when mouse over a country show the number in the information box
    showCountryLaureatesCount(worldData, laureatesArray);

    // define a new variable to store the prizes in the format of an object {year: 1901, chemistry: 2, economics: ....}
    var prizesCount = prizesCountByYearCategory(prizes.prizes);
    // draw initial stacked bar chart of years during 1901-2016
    drawStackedBarChart(filterPrizesByYearRange(prizesCount, minYear, maxYear));

    // draw initial pie chart of gender distribution between year 1901-2016
    drawGenderPieChart (laureatesArray, minYear, maxYear);

    //move the slider and filter data then redraw bar chart and markers on the map
    $("#slider-range").slider({
        slide: function (event, ui) {

            $("#yearRange").val(ui.values[0] + " - " + ui.values[1]);
            minYear= ui.values[0];
            maxYear= ui.values[1];
            $("#graph").empty();
            // update stacked bar chart based on the slider's values
            drawStackedBarChart(filterPrizesByYearRange(prizesCount, minYear, maxYear));

            // remove markers existed on the map before adding new markers
            $.each(markers, function(i,val) {
                map.removeLayer(val);
            });
            // remove polygons existed on the map
            if (map.hasLayer(polygon)) {
                map.removeLayer(polygon);
            };
            // update markers on the map based on slider's values
            showLaureateMarkers(laureatesArray, minYear, maxYear);
            // empty the existed pie chart
            $('#piechart').empty();
            // update the gender pie chart
            drawGenderPieChart (laureatesArray, minYear, maxYear);
        }
    });

}


/**
 * Filter laureates data by given gender and category for later use of assigning colours and icons for each laureate on map
 * @param laureatesdata {Array} - the laureates json array
 * @param gender {string} - 'female', 'male'
 * @param category {string} - nobel prize categories, e.g. 'chemistry', 'economics', etc.
 * @returns {Array}
 */
function filterLaureatesByGenderCategory(laureatesdata, gender, category) {
    var result = [];
    $.each(laureatesdata, function(i,val) {
        if(val.gender === gender && val.prizes[0].category === category)
            result.push(val);
    })
    return result;
}


/**
 * Reformat the prizes data, and returning a format of an array of json objects with year and count of people in each categories
 * @param prizes {Array} - data from prizes.json file
 * @returns {Array}
 */
function prizesCountByYearCategory (prizes) {
    var prizesRollup = d3.nest()
        .key(function(d) {return d.year;})
        .entries(prizes);
    var result = []
    $.each(prizesRollup, function(i, val) {
        result.push({
            year: val.key,
            chemistry: categoryCount(val.values, 'chemistry'),
            economics: categoryCount(val.values, 'economics'),
            literature: categoryCount(val.values, 'literature'),
            medicine: categoryCount(val.values, 'medicine'),
            peace: categoryCount(val.values, 'peace'),
            physics: categoryCount(val.values, 'physics')
        })
    })
    return result;
}

/**
 * Count people in each categories, this function is called in the function above (prizeCountByYearCategory)
 * @param dataArray {Array} - an array of objects rollup by year as the key value
 * @param category {string} - category names
 * @returns {number} - count of laureates in this category
 */
function categoryCount(dataArray, category) {
    var count = 0;
    $.each(dataArray, function(i,val) {
        if(val.category === category) {
            count = val.laureates.length;
        }
    })
    return count;
}

/**
 * Filter through the new prizes data array given the min and max vaules of years
 * @param prizes {Array} - the format of json objects in this array are generated from the function above
 * @param minyear {Number}
 * @param maxyear {Number}
 * @returns {Array}
 */
function filterPrizesByYearRange (prizes, minyear, maxyear) {
    var result = [];
    $.each(prizes, function(i, val) {
        if(Number(val.year) >= minyear && Number(val.year) <= maxyear)
            result.push(val);
    })
    return result;
}

/**
 * Draw stacked bar chart add to the container
 * codes adapted from http://bl.ocks.org/mstanaland/6100713
 * @param data
 */
function drawStackedBarChart (data) {
    // define margins
    var margin = {top: 20, right: 100, bottom: 40, left: 20};

    var width = 640 - margin.left - margin.right,
        height = 400 - margin.top - margin.bottom;

    var svg = d3.select("#graph")
        .append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    var yearparse = d3.time.format("%Y").parse;
    // Transpose the data into layers
    var dataset = d3.layout.stack()(['chemistry','economics','literature','literature', 'peace', 'physics'].map(function(category) {
        return data.map(function(d) {
            return {x: yearparse(d.year), y: +d[category]};
        });
    }));

    // Set x, y and colors
    var x = d3.scale.ordinal()
        .domain(dataset[0].map(function(d) { return d.x; }))
        .rangeRoundBands([5, width], 0.05);

    var y = d3.scale.linear()
        .domain([0, d3.max(dataset, function(d) {  return d3.max(d, function(d) { return d.y0 + d.y; });  })])
        .range([height, 0]);

    // define colors for each category
    var colors = ["#2E86C1", "#E67E22", "#C0392B", "#F4D03F", "#239B56", "#8E44AD"];

    // Define and draw axes
    var yAxis = d3.svg.axis()
        .scale(y)
        .orient("left")
        .ticks(5)
        .tickSize(-width, 0, 0)
        .tickFormat( function(d) { return d } );

    var xAxis = d3.svg.axis()
        .scale(x)
        .orient("bottom")
        .tickFormat(d3.time.format("%Y"));

    svg.append("g")
        .attr("class", "y axis")
        .call(yAxis);

    // add x-axis texts and rotate
    svg.append("g")
        .attr("class", "x axis")
        .attr("transform", "translate(0," + height + ")")
        .call(xAxis)
        .selectAll("text")
        .style("text-anchor", "end")
        .attr("dx", "-1em")
        .attr("dy", ".1em")
        .attr("transform", function(d) {
            return "rotate(-65)"
        });

    // Create groups for each series, rects for each segment
    var groups = svg.selectAll("g.count")
        .data(dataset)
        .enter().append("g")
        .attr("class", "count")
        .style("fill", function(d, i) { return colors[i]; });

    var rect = groups.selectAll("rect")
        .data(function(d) { return d; })
        .enter()
        .append("rect")
        .attr("x", function(d) { return x(d.x); })
        .attr("y", function(d) { return y(d.y0 + d.y); })
        .attr("height", function(d) { return y(d.y0) - y(d.y0 + d.y); })
        .attr("width", x.rangeBand())
        .on("mouseover", function() { tooltip.style("display", null); })
        .on("mouseout", function() { tooltip.style("display", "none"); })
        .on("mousemove", function(d) {
            var xPosition = d3.mouse(this)[0] - 15;
            var yPosition = d3.mouse(this)[1] - 25;
            tooltip.attr("transform", "translate(" + xPosition + "," + yPosition + ")");
            tooltip.select("text").text(d.y);
        });

    // Prep the tooltip bits, initial display is hidden
    var tooltip = svg.append("g")
        .attr("class", "tooltip")
        .style("display", "none");

    tooltip.append("rect")
        .attr("width", 30)
        .attr("height", 20)
        .attr("fill", "white")
        .style("opacity", 0.5);

    tooltip.append("text")
        .attr("x", 15)
        .attr("dy", "1.2em")
        .style("text-anchor", "middle")
        .attr("font-size", "12px")
        .attr("font-weight", "bold");


    // Draw legend
    var graphlegend = svg.selectAll(".legend")
        .data(colors)
        .enter().append("g")
        .attr("class", "legend")
        .attr("transform", function(d, i) { return "translate(30," + i * 19 + ")"; });

    graphlegend.append("rect")
        .attr("x", width - 18)
        .attr("width", 18)
        .attr("height", 18)
        .style("fill", function(d, i) {return colors.slice().reverse()[i];});

    graphlegend.append("text")
        .attr("x", width + 5)
        .attr("y", 9)
        .attr("dy", ".35em")
        .style("text-anchor", "start")
        .text(function(d, i) {
            switch (i) {
                case 0: return "Physics";
                case 1: return "Peace";
                case 2: return "Medicine";
                case 3: return "Literature";
                case 4: return "Economics";
                case 5: return "Chemistry";
            }
        });
}

/**
 * Calculate numbers of laurates born in each country and display in choropleth map, load world geo json data
 * Draw choropleth map, codes adapted from leaflet examples
 * @param worldData {Array} - geo json data from https://github.com/drwelby/world.geo.json
 * @param laureatesArray {Array}
 */
function showCountryLaureatesCount(worldData, laureatesArray) {
    //removeAllMarkers();
    var laureateByCountryCount = d3.nest()
        .key(function(d) { return d.bornCountryCode})
        .rollup(function(v) { return v.length})
        .entries(laureatesArray);

    //add count to the world geoJson properties as an attribute.
    var worldDatawithCount = addPropertitytoGeoJson(laureateByCountryCount, worldData.features);

    //source code from leaflet.com/examples/choropleth
    var geojson = L.geoJson(worldDatawithCount, {
        style: style,
        onEachFeature: onEachFeature
    }).addTo(map);

    var info = L.control();

    info.onAdd = function (map) {
        this._div = L.DomUtil.create('div', 'info'); // create a div with a class "info"
        this.update();
        return this._div;
    };

    // method that we will use to update the control based on feature properties passed
    info.update = function (props) {
        this._div.innerHTML = '<h4>Global Laureates</h4>' +  (props ?
            '<b>' + props.name + '</b><br />' + ((props.count)?props.count:0) + ' people'
                : 'Hover over a country <br>or click on a popup');
    };

    info.addTo(map);

    var maplegend = L.control({position: 'bottomright'});
    maplegend.onAdd = function (map) {

        var div = L.DomUtil.create('div', 'info legend'),
            grades = [0, 5, 10, 20, 50, 100, 200],
            labels = [];

        for (var i = 0; i < grades.length; i++) {
            //console.log(getColor(grades[i] + 1));
            div.innerHTML +=
                '<i style="background:' + getColor(grades[i] + 1) + '"></i> ' +
                grades[i] + (grades[i + 1] ? '&ndash;' + grades[i + 1] + '<br>' : '+');
        }
        return div;
    };

    maplegend.addTo(map);


    /**
     * Add count of laureates each country to the world geo json data as a new property
     * @param dataArray
     * @param geojsonArray
     * @returns {*}
     */
    function addPropertitytoGeoJson(dataArray, geojsonArray) {
        $.each(dataArray, function(i, data) {
            $.each(geojsonArray, function(index, country) {
                if(country.id2 === data.key) {
                    country.properties.count = data.values;
                }
            })
        })
        return geojsonArray;
    }

    /**
     * Assign colours to different levels
     * reference from: leaflet..js/examples/choropleth/
     */

    function getColor(d) {
        return d > 200 ? '#39566a' :
            d > 100 ? '#406177' :
                d > 50 ? '#54809d' :
                    d > 20 ? '#5d8aa8' :
                        d > 10 ? '#779cb6' :
                            d > 5 ? '#9db8ca' :
                                d > 0 ? '#d0dde6' :
                                    'transparent' ;
    }

    //set country colour based on the number of laureates born in this country
    function style(feature) {
        return {
            fillColor: getColor(feature.properties.count),
            weight: 1,
            opacity: 0.7,
            dashArray: '3',
            color: '#ececec',
            fillOpacity: 0.7
        };
    }

    function highlightFeature(e) {
        var layer = e.target;

        layer.setStyle({
            weight: 3,
            color: '#666',
            dashArray: '',
            fillOpacity: 0.7
        });

        if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
            layer.bringToFront();
        }

        info.update(layer.feature.properties);
    }

    function resetHighlight(e) {
        geojson.resetStyle(e.target);
        info.update();
    }

    function onEachFeature(feature, layer) {
        layer.on({
            mouseover: highlightFeature,
            mouseout: resetHighlight
        });
    }
}

/**
 * Filter laureates given the min and max year values
 * Show markers on the map
 * @param laureates {Array}
 * @param minyear {number}
 * @param maxyear {number}
 */
function showLaureateMarkers(laureates, minyear, maxyear) {
    var newLaureates = [];
    $.each(laureates, function(i, val) {
        if(val.prizes[0].year >= minyear && val.prizes[0].year <= maxyear) {
            newLaureates.push(val);
        }
    });


    //set markers on the map with different colours represents different category and female and male gender icons
    //call the function defined above
    setMarker(filterLaureatesByGenderCategory(newLaureates, 'female', 'chemistry'), fchemistryMarker);
    setMarker(filterLaureatesByGenderCategory(newLaureates, 'male', 'chemistry'), mchemistryMarker);
    setMarker(filterLaureatesByGenderCategory(newLaureates, 'female', 'economics'), feconomicsMarker);
    setMarker(filterLaureatesByGenderCategory(newLaureates, 'male', 'economics'), meconomicsMarker);
    setMarker(filterLaureatesByGenderCategory(newLaureates, 'female', 'literature'), fliteratureMarker);
    setMarker(filterLaureatesByGenderCategory(newLaureates, 'male', 'literature'), mliteratureMarker);
    setMarker(filterLaureatesByGenderCategory(newLaureates, 'female', 'medicine'), fmedicineMarker);
    setMarker(filterLaureatesByGenderCategory(newLaureates, 'male', 'medicine'), mmedicineMarker);
    setMarker(filterLaureatesByGenderCategory(newLaureates, 'female', 'peace'), fpeaceMarker);
    setMarker(filterLaureatesByGenderCategory(newLaureates, 'male', 'peace'), mpeaceMarker);
    setMarker(filterLaureatesByGenderCategory(newLaureates, 'female', 'physics'), fphysicsMarker);
    setMarker(filterLaureatesByGenderCategory(newLaureates, 'male', 'physics'), mphysicsMarker);

    /**
     * Set marker of each laureate, function is called above
     * Show detail infomation of each laureate in the popup
     * @param data {Array}
     * @param markerIcon - marker variables defined in the markers.js
     */
    function setMarker(data, markerIcon) {
        $.each(data, function(i,val) {
            if(val.latitude && val.longitude) {
                var personalInfo = "name: "+val.name+
                    "<br>born: " +val.born+
                    "<br>died: " +val.died+
                    "<br>bornPlace: " +val.bornCountry+"-"+val.bornCity+
                    "<br>diedPlace: "+val.diedCountry+"-"+val.diedCity+
                    "<br>prize: " + val.prizes[0].year+"-"+val.prizes[0].category+
                    "<br>prize share: 1/"+ val.prizes[0].share+
                    "<br>motivation: "+val.prizes[0].motivation;

              var marker = L.marker([val.latitude, val.longitude],{icon: markerIcon});
                  // .addTo(map)
                  marker.bindPopup(personalInfo);
                    marker.on('click', connectLaureatesShareOnePrize);

                markers.push(marker);
                map.addLayer(marker);

            }

        });
    }


    /**
     * Draw polygons between laureates who share the same prize when the user clicks on one of them
     * @param e
     */
    function connectLaureatesShareOnePrize (e) {
        if (map.hasLayer(polygon)) {
            map.removeLayer(polygon);
        }
        var prize = $('.leaflet-popup-content').html().match(/prize:\s(\S*)\</)[1];
        var year = prize.split("-")[0];
        var category = prize.split("-")[1];
        var coordsArray = [];
        $.each(newLaureates, function(i, val) {
            if(val.prizes[0].year === year && val.prizes[0].category === category) {
                if(val.latitude && val.longitude)
                    coordsArray.push([val.latitude, val.longitude]);
            }
        })
        if(coordsArray.length !== 1) {
            polygon = L.polygon(coordsArray,{fillColor: 'transparent', weight: 2, dashArray: '3'});
            map.addLayer(polygon);
        }
    }
}

/**
 * Draw gender distribution pie charts
 * codes adapted from http://bl.ocks.org/Potherca/b9f8b3d0a24e0b20f16d
 * @param laureatesArray
 * @param minyear
 * @param maxyear
 */
function drawGenderPieChart (laureatesArray, minyear, maxyear) {
    var newLaureates = [];
    $.each(laureatesArray, function(i, val) {
        if(val.prizes[0].year >= minyear && val.prizes[0].year <= maxyear) {
            newLaureates.push(val);
        }
    });

    var laureatesCountByGender = d3.nest()
        .key(function(d) {return d.gender;})
        .rollup(function(v) {return v.length;})
        .entries(newLaureates);

    var width = 200;
    var height = 200;
    var radius = Math.min(width, height) / 2;

    var color = ['#bbcbdb','#f1e8ca','#745151'];

    var vis = d3.select('#piechart')
        .append("svg")
        .data([laureatesCountByGender])
        .attr("width", width)
        .attr("height", height).append("g").attr("transform", "translate(" + radius + "," + radius + ")");

    var pie = d3.layout.pie().value(function(d){return d.values;}).sort(null);

    // Declare an arc generator function
    var arc = d3.svg.arc().outerRadius(radius);

    // Select paths, use arc generator to draw
    var arcs = vis.selectAll("g.slice").data(pie).enter().append("g").attr("class", "slice");
    arcs.append("path")
        .attr("fill", function(d,i){return color[i]; })
        .attr("d", function (d) {return arc(d);})
    ;

    // Add the text
    arcs.append("svg:text")
        .attr("transform", function(d){
            d.innerRadius = 30; /* Distance of label to the center*/
            d.outerRadius = radius;
            return "translate(" + arc.centroid(d) + ")";}
        )
        .attr("text-anchor", "middle")
        .text( function(d) {return d.data.key+"\n"+ d.data.values;})
    ;
}







