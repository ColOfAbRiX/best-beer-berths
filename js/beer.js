/*
MIT License

Copyright (c) 2017-2026 Fabrizio Colonna <colofabrix@tin.it>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

"use strict";

/**
 * Stores of all the Beer Places and some additional information
 */
var PlacesDB = (function() {

  var Cache = (function() {
    var BeerPlacesDB = "BeerPlacesDB_" + BEER_DATABASE_FILE;
    var BeerPlacesDBHash = "BeerPlacesDBHash_" + BEER_DATABASE_FILE;
    var BeerPlacesDBTimestamp = "BeerPlacesDBTimestamp_" + BEER_DATABASE_FILE;

    /**
     * Loads the cache into the local beer DB
     */
    var load = function() {
      // Check cache enabled
      if( !CACHE_ENABLED ) {
        Logger.info("Cache is disabled");
        reset();
        return false;
      }

      Logger.info("Looking for saved cache");

      var cache = window.localStorage.getItem( BeerPlacesDB );
      if( cache ) {
        var cache_hash = window.localStorage.getItem( BeerPlacesDBHash );
        var cache_timestamp = parseInt( window.localStorage.getItem( BeerPlacesDBTimestamp ) || 0 );

        Logger.debug( `BeerPlacesDBHash: ${cache_hash}` );
        Logger.debug( `BeerPlacesDBTimestamp: ${cache_timestamp}` );
        Logger.debug( `Current timestamp: ${new Date().getTime()}` );
        Logger.trace( `BeerPlacesDB: ${cache}` );

        // Check expiry
        var expired = ( new Date().getTime() - cache_timestamp ) >= CACHE_DURATION * 1000;
        if( expired ) {
          Logger.info( `Cache expired.` )
          return false;
        }

        // Check hash
        var hashMatch = dbHash() === cache_hash;
        if( !hashMatch ) {
          Logger.info( `Cache found (${cache_hash}) but doesn't match data (${dbHash()}).` )
          return false;
        }

        // Load
        Logger.debug( `Loading objects from JSON` );
        var places = JSON.parse( cache );

        // Convert the cache into proper BeerPlace objects
        local_db = new Array();
        for( var place of places ) {
          var bp = BeerPlace.loadFromJSON( place );
          local_db.push( bp );
        }

        Logger.info( `Found and loaded cache ${cache_hash}` );
        return true;
      }

      return false;
    };

    /**
     * Saves the DB places into the cache
     */
    var save = function() {
      // Check cache enabled
      if( !CACHE_ENABLED ) {
        reset();
        return false;
      }

      Logger.info( `Saving cache for DB ${dbHash()}` );

      window.localStorage.setItem( BeerPlacesDB, JSON.stringify(local_db) );
      window.localStorage.setItem( BeerPlacesDBHash, dbHash() );
      window.localStorage.setItem( BeerPlacesDBTimestamp, new Date().getTime() );

      return true;
    };

    /**
     * Resets the local cache
     */
    var reset = function() {
      if( CACHE_ENABLED ) {
        window.localStorage.removeItem( BeerPlacesDB );
        window.localStorage.removeItem( BeerPlacesDBHash );
        window.localStorage.removeItem( BeerPlacesDBTimestamp );
        Logger.info( "Reset cache: cache cleaned" );
      }
      else {
        Logger.debug( "Reset cache: the cache is not enabled" );
      }
    };

    /**
     * TODO: Imports a cache file
     */
    var importCache = function(cacheFile) {
    };

    /**
     * TODO: Exports a cache file
     */
    var exportCache = function() {
    };

    return {
      'load': load,
      'save': save,
      'reset': reset,
      'import': importCache,
      'export': exportCache
    };
  })();

  // Database with all the places
  var local_db = new Array();
  // Local cache, to save some time...
  var dataCache = {
    'maxAvgScore': {},
    'minAvgScore': {}
  };

  /**
   * Initializes the DB
   */
  var init = function( raw_data ) {
    // Select the subset of data based on BEER_PATH
    var data_to_load = _selectPlace(raw_data, BEER_PATH);

    console.log("BEER_PATH", BEER_PATH);
    console.log("data_to_load", data_to_load);

    // Interpreting YAML data as first thing
    local_db = _parseYaml( data_to_load );

    // Starts the filling of the Beer Places DB
    if( Cache.load() ) {
      Logger.debug( "Adding cached objects to the map" );
      for( var place of local_db ) {
        Logger.trace( `Adding ${place.toString()} to the map` );
        addPlaceToMap( place );
      }
      _finalizeLoad();
    }
    else {
      // Start the querying process
      _queryForLocations();
    }
  };

/**
 * Selects a subset of the beer places data based on a path
 */
var _selectPlace = function(raw_data, path) {
  if (!path || path === "") {
    return raw_data;
  }

  var parts = path.split('.');
  var current = raw_data;

  for (var i = 0; i < parts.length; i++) {
    if (current.hasOwnProperty(parts[i])) {
      current = current[parts[i]];
    } else {
      return {};
    }
  }

  // Special case: if path is just one level (e.g., "England"),
  // we want to return { "England": <england_data> }
  if (parts.length === 1) {
    var result = {};
    result[parts[0]] = current;
    return result;
  }

  // For longer paths (e.g., "England.London"), we want to return:
  // { "England": { "London": <london_data> } }
  var result = {};
  var currentLevel = result;

  for (var i = 0; i < parts.length - 1; i++) {
    currentLevel[parts[i]] = {};
    currentLevel = currentLevel[parts[i]];
  }

  currentLevel[parts[parts.length - 1]] = current;

  return result;
};

  /**
   * Scan all the YAML results and build the database
   */
  var _parseYaml = function( yaml_data ) {
    Logger.trace( "Loading objects from YAML" );
    var result = new Array();

    for( var country in yaml_data ) {
      var country_cities = yaml_data[country];
      for( var city in country_cities ) {
        var city_places = country_cities[city];
        for( var beer_place of city_places ) {
          // Check the data is valid, if not don't add it
          if( !_checkRawData(beer_place) ) {
            Logger.warn( `Missing information on entry ${JSON.stringify(beer_place)}` );
            continue;
          }

          var bp = new BeerPlace(beer_place, country, city);
          result.push( bp );
        }
      }
    }

    return result.sort();
  };

  /**
   * Checks that the raw data for a place is valid, with all the data
   */
  var _checkRawData = function( raw_item ) {
    Logger.trace( `Checking data validity for ${raw_item}` );

    // Check for "Name"
    if( !'Name' in raw_item || !raw_item.Name ) {
      return false;
    }
    // Check for "Address"
    if( !'Address' in raw_item || !raw_item.Address ) {
      return false;
    }
    // Check for "Type"
    if( !'Type' in raw_item || !raw_item.Type ) {
      return false;
    }
    // Check for "Status"
    if( !'Status' in raw_item || !raw_item.Status ) {
      return false;
    }

    if( raw_item.Status.toLowerCase() === "to try" ) {
      // Check for "Expectation"
      if( !'Expectation' in raw_item || !raw_item.Expectation ) {
        return false;
      }
      // Check for "Expectation.Mine"
      if( !'Mine' in raw_item || !raw_item.Expectation.Mine ) {
        return false;
      }
      // Check for "Expectation.Google"
      if( !'Google' in raw_item || !raw_item.Expectation.Google ) {
        return false;
      }
    }

    if( raw_item.Status.toLowerCase() === "tried" ) {
      // Check for "Score"
      if( !'Score' in raw_item || !raw_item.Score ) {
        return false;
      }
    }

    return true;
  };

  /**
   * Loads asynchronously the information about the location of all the places
   * Uses Nominatim (OpenStreetMap's geocoding service)
   */
  var _queryForLocations = function() {
    var start_queue = local_db.slice();
    var end_queue = new Array();

    // Stats
    var start = new Date().getTime();
    var queries = 0, failures = 0;

    // Run task
    processQueueAsync(
      /* inputQueue, outputQueue */
      start_queue, end_queue,
      /* action */
      ( place ) => place.queryLocation.bind( place ),
      /* successValue */
      PlacesServiceStatus.OK,
      /* successAction */
      ( place ) => {
        Logger.trace( `Adding ${place.toString()} to the map` );
        addPlaceToMap( place );
        queries++;
      },
      /* failAction */
      ( place, error ) => {
        if( error === PlacesServiceStatus.OVER_QUERY_LIMIT ) {
          // In case of rate limiting, retry
          Logger.error( `Rate limit error for ${place.toString()}: ${error}` );
          failures++;
        }
        else {
          // In all other error cases, drop the item and continue
          var queried_place = start_queue.shift();
          Logger.error( `Error querying location for ${place.toString()}: ${error}` );
          failures++;
          if( end_queue != undefined ) {
            end_queue.push( queried_place );
          }
        }
      },
      /* doneAction */
      ( place ) => {
        var time = ( new Date().getTime() - start ) / 1000.0;

        Logger.warn( `All locations done: items=${local_db.length}, successful=${end_queue.length} queries=${queries}, failures=${failures}, time=${time.toFixed(3)}s.` );
        local_db = end_queue;

        // Perform the final actions
        _finalizeLoad();
      }
    );
  };

  /**
   * Loads asynchronously the information about the location of all the places
   */
  var _queryForDetails = function() {
    var start_queue = local_db.slice();
    var end_queue = new Array();

    // Stats
    var start = new Date().getTime();
    var queries = 0, failures = 0;

    // Run task
    processQueueAsync(
      /* inputQueue, outputQueue */
      start_queue, end_queue,
      /* action */
      ( place ) => place.queryDetails.bind( place ),
      /* successValue */
      PlacesServiceStatus.OK,
      /* successAction */
      ( place ) => {
        queries++;
      },
      /* failAction */
      ( place, error ) => {
        var queried_place = start_queue.shift();
        Logger.error( `Error querying location for ${place.toString()}: ${error}` );
        failures++;
        if( end_queue != undefined ) {
          end_queue.push( queried_place );
        }
      },
      /* doneAction */
      ( place ) => {
        var time = ( new Date().getTime() - start ) / 1000.0;

        Logger.warn( `All details done: items=${local_db.length}, successful=${end_queue.length} queries=${queries}, failures=${failures}, time=${time.toFixed(3)}s.` );
        local_db = end_queue;

        // Perform the final actions
        _finalizeLoad();
      }
    );
  };

  /**
   * Converts a database of point into data for heatmap (stub - not used in Leaflet version)
   */
  var _db2heatmap = function( data ) {
    return [];
  };

  /**
   * Final actions when all places have been loaded
   */
  var _finalizeLoad = function() {
    Logger.info("Finalizing visualization of places");
    // Save the cache
    if( CACHE_ENABLED ) {
      Cache.save();
    }
  }

  /**
   * Request the toggle of the Heatmap (stub - not used in Leaflet version)
   */
  var toggleHeatmap = function() {
    Logger.info( "Heatmap feature not available in Leaflet version" );
  };

  /**
   * A fingerprint of the Database data, excluding OSM data
   */
  var dbHash = function() {
    var hashes = local_db.map( x => x.data_hash );
    return objectHash.sha1(
      JSON.stringify( hashes )
    );
  };

  /**
   * The highest average amongst all places, given a filter on places
   */
  var maxAvgScore = function( filter_callback = x => true, data = local_db ) {
    return data
      .filter( filter_callback )
      .map( x => x.avg_score )
      .reduce( ( x1, x2 ) => Math.max( x1, x2 ), 0.0 );
  };

  /**
   * The lowest average amongst all places, given a filter on places
   */
  var minAvgScore = function( filter_callback = x => true, data = local_db ) {
    return data
      .filter( filter_callback )
      .map( x => x.avg_score )
      .reduce( ( x1, x2 ) => Math.min( x1, x2 ), 10.0 );
  };

  /**
   * The average score amongst all places, given a filter on places
   */
  var avgAvgScore = function( filter_callback = x => true, data = local_db ) {
    var subset = data.filter( filter_callback ).map( x => x.avg_score );
    var sum = subset.reduce( ( x1, x2 ) => x1 + x2, 0.0 );
    return sum / subset.length;
  };

  /**
   * Requests the addition of a marker on the map
   */
  var addPlaceToMap = function( place ) {
    // Group the colouring by Status
    var status = place.status;
    var filter = x => x.status === status;

    // Use a cache to calculate the values only once
    if( !(status in dataCache.maxAvgScore) ) {
      dataCache.maxAvgScore[status] = maxAvgScore(filter);
    }
    if( !(status in dataCache.minAvgScore) ) {
      dataCache.minAvgScore[status] = minAvgScore(filter);
    }

    // Request the addition
    GoogleMap.addMarker(
      place,
      dataCache['minAvgScore'][status],
      dataCache['maxAvgScore'][status]
    );
  };

  return {
    'Cache': Cache,
    'init': init,
    'dbHash': dbHash,
    'maxAvgScore': maxAvgScore,
    'minAvgScore': minAvgScore,
    'toggleHeatmap': toggleHeatmap
  };
})();


/**
 * Represents a Beer Place with its information and data
 */
class BeerPlace {
  /**
   * Constructor
   */
  constructor( raw_data, country = null, city = null ) {
    this.raw_data = raw_data;
    // Other places will use this, so this must go first
    this.status = this.raw_data.Status.toLowerCase();
    if( country != null ) {
      this.raw_data.Country = country;
    }
    if( city != null ) {
      this.raw_data.City = city;
    }
    this.data_hash = this._dataHash();
    this.avg_score = this._avgScore();
  }

  /**
   * Creates a BeerPlace from a JSON string
   */
  static loadFromJSON( json_object ) {
    var bp = new BeerPlace( json_object.raw_data );
    Object.assign( bp, {
      osm_details: json_object.osm_details,
      osm_location: json_object.osm_location
    });
    return bp;
  }

  /**
   * A fingerprint of the object, calculated with only the YAML data
   */
  _dataHash() {
    return objectHash.sha1( this.raw_data );
  }

  /**
   * The average score of the place
   */
  _avgScore() {
    // Missing status
    if( !this.raw_data.Status ) {
      Logger.error( `Missing Status for "${this.toString()}"` )
      return 0.0;
    }

    var average = 0.0;
    var count = 0;
    var penalty = 0.0;

    if( this.status === 'tried' ) {
      // Draught score (weight of 33%)
      if( 'Draught' in this.raw_data.Score ) {
        if( this.raw_data.Score.Draught > 0.0 ) {
          average += this.raw_data.Score.Draught * 3.0;
          count += 3;
        }
        else penalty = 0.33;
      }

      // Bottles score (weight of 33%)
      if( 'Bottles' in this.raw_data.Score ) {
        if( this.raw_data.Score.Bottles > 0.0 ) {
          average += this.raw_data.Score.Bottles * 3.0;
          count += 3;
        }
        else penalty = 0.33;
      }

      // Place score (weight of 22%)
      if( 'Place' in this.raw_data.Score ) {
        if( this.raw_data.Score.Place > 0.0 ) {
          average += this.raw_data.Score.Place * 2.0;
          count += 2;
        }
        else penalty = 0.22;
      }

      // Food score (weight of 11%)
      if( 'Food' in this.raw_data.Score ) {
        if( this.raw_data.Score.Food > 0.0 ) {
          average += this.raw_data.Score.Food * 1.0;
          count += 1;
        }
        else penalty = 0.11;
      }

      // Final calculations
      average /= count;
      average -= penalty;
    }
    else if( this.status === 'to try' ) {
      // Personal score (weight of 60%)
      if( 'Mine' in this.raw_data.Expectation ) {
        average += this.raw_data.Expectation.Mine * 3.0;
        count += 3;
      }

      // Google score, ranges from 0 to 5 (weight of 40%)
      if( 'Google' in this.raw_data.Expectation ) {
        average += this.raw_data.Expectation.Google * 4.0;
        count += 2;
      }

      // Final calculations
      average /= count;
      average -= penalty;
    }

    return average;
  }

  /**
   * Queries Nominatim (OpenStreetMap) to fetch information about the position
   * and then calls a callback function when the data is available.
   */
  queryLocation( callback, force = false ) {
    // Skip if already present
    if( this.osm_location && !force ) {
      Logger.warn( `Location data already loaded for ${this.toString()}` );
      if( callback ) {
        callback( this, PlacesServiceStatus.OK );
      }
      return;
    }

    var thisRef = this;
    // Use just the address for better Nominatim results (business names often confuse it)
    var query = this.raw_data.Address;

    // Determine the appropriate Nominatim URL based on environment
    // When running locally (localhost), use our proxy to avoid CORS issues
    // When running in production, use the direct Nominatim URL
    var nominatimBaseUrl = window.location.hostname === 'localhost' ||
                          window.location.hostname === '127.0.0.1' ||
                          window.location.host.indexOf('localhost') !== -1
        ? '/proxy/nominatim'
        : 'https://nominatim.openstreetmap.org/search';

    var url = nominatimBaseUrl + '?format=json&q=' + encodeURIComponent(query) + '&limit=1';

    $.ajax({
      url: url,
      dataType: 'json',
      headers: {
        'User-Agent': 'BestBeerBerths/1.0'
      },
      success: function(results) {
        Logger.info( `Nominatim search completed for "${thisRef.toString()}"` );

        if( results && results.length > 0 ) {
          var result = results[0];

          thisRef.osm_location = {
            place_id: result.place_id,
            osm_id: result.osm_id,
            osm_type: result.osm_type,
            display_name: result.display_name,
            lat: parseFloat(result.lat),
            lon: parseFloat(result.lon),
            boundingbox: result.boundingbox,
            class: result.class,
            type: result.type
          };

          Logger.info( `Found location for "${thisRef.toString()}": ${thisRef.osm_location.display_name}` );
          Logger.debug( `OSM location for "${thisRef.toString()}"`, thisRef.osm_location );

          if( callback ) {
            callback( thisRef, PlacesServiceStatus.OK );
          }
        }
        else {
          Logger.warn( `No results found for "${thisRef.toString()}"` );
          if( callback ) {
            callback( thisRef, PlacesServiceStatus.ZERO_RESULTS );
          }
        }
      },
      error: function(xhr, status, error) {
        Logger.error( `Nominatim error for "${thisRef.toString()}": ${error}` );

        // Check for rate limiting
        if( xhr.status === 429 ) {
          if( callback ) {
            callback( thisRef, PlacesServiceStatus.OVER_QUERY_LIMIT );
          }
        }
        else {
          if( callback ) {
            callback( thisRef, PlacesServiceStatus.ERROR );
          }
        }
      }
    });
  }

  /**
   * Queries Overpass API for detailed information about the place including
   * opening hours, and then calls a callback function when the data is available.
   * Uses coordinates from geocoding to search nearby, combined with name matching.
   */
  queryDetails( callback, force = false ) {
    if( this.osm_details && !force ) {
      Logger.warn( `Details data already loaded for ${this.raw_data.Name}` );
      if( callback ) {
        callback( this, PlacesServiceStatus.OK );
      }
      return;
    }

    if( !this.osm_location ) {
      Logger.warn( `Can't query details - no location for ${this.raw_data.Name}` );
      this.osm_details = {};
      if( callback ) {
        callback( this, PlacesServiceStatus.OK );
      }
      return;
    }

    var thisRef = this;

    // Escape special characters in the name for regex search
    var escapedName = this.raw_data.Name
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')  // Escape regex special chars
      .replace(/'/g, "\\'");  // Escape single quotes for Overpass

    // Use coordinates from geocoding with a reasonable radius (500m)
    var lat = this.osm_location.lat;
    var lon = this.osm_location.lon;

    // Build Overpass query: Search by NAME near the geocoded coordinates
    // This combines location precision with name matching
    var overpassQuery = `
      [out:json][timeout:15];
      (
        node["name"~"${escapedName}",i](around:500,${lat},${lon});
        way["name"~"${escapedName}",i](around:500,${lat},${lon});
        relation["name"~"${escapedName}",i](around:500,${lat},${lon});
      );
      out body;
    `;

    Logger.debug( `Overpass query for "${thisRef.raw_data.Name}" near (${lat},${lon})` );

    var url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`;

    $.ajax({
      url: url,
      dataType: 'json',
      success: function(data) {
        Logger.info( `Overpass details search completed for "${thisRef.raw_data.Name}"` );

        if( data && data.elements && data.elements.length > 0 ) {
          // Try to find the best match by looking for opening_hours
          var element = data.elements[0];
          for( var el of data.elements ) {
            if( el.tags && el.tags.opening_hours ) {
              element = el;
              break;
            }
          }

          thisRef.osm_details = {
            name: element.tags ? element.tags.name : null,
            opening_hours: element.tags ? element.tags.opening_hours : null,
            website: element.tags ? element.tags.website : null,
            phone: element.tags ? element.tags.phone : null,
            cuisine: element.tags ? element.tags.cuisine : null,
            amenity: element.tags ? element.tags.amenity : null,
            addr_street: element.tags ? element.tags['addr:street'] : null,
            addr_housenumber: element.tags ? element.tags['addr:housenumber'] : null,
            addr_city: element.tags ? element.tags['addr:city'] : null
          };

          Logger.info( `Found details for "${thisRef.raw_data.Name}" (OSM name: "${thisRef.osm_details.name}").` );
          Logger.debug( `Details for "${thisRef.raw_data.Name}".`, thisRef.osm_details );

          if( callback ) {
            callback( thisRef, PlacesServiceStatus.OK );
          }
        }
        else {
          Logger.warn( `No Overpass details found for "${thisRef.raw_data.Name}" near (${lat},${lon})` );
          thisRef.osm_details = {};
          if( callback ) {
            callback( thisRef, PlacesServiceStatus.OK );
          }
        }
      },
      error: function(xhr, status, error) {
        Logger.error( `Overpass error for "${thisRef.raw_data.Name}": ${error}` );
        thisRef.osm_details = {};
        if( callback ) {
          callback( thisRef, PlacesServiceStatus.ERROR );
        }
      }
    });
  }

  /**
   * Check if the place is currently open based on opening_hours tag
   */
  _isOpenNow() {
    if( !this.osm_details || !this.osm_details.opening_hours ) {
      return null;
    }

    try {
      // Use the opening_hours library if available
      if( typeof opening_hours !== 'undefined' ) {
        var oh = new opening_hours(this.osm_details.opening_hours);
        return oh.getState();
      }
    }
    catch( e ) {
      Logger.debug( `Could not parse opening hours for "${this.raw_data.Name}": ${e}` );
    }

    return null;
  }

  /**
   * Build the InfoWindow content for the place
   */
  htmlDetails() {
    // See https://www.openstreetmap.org/directions
    var directions_url = "https://www.openstreetmap.org/directions?";
    if( this.osm_location ) {
      directions_url += `route=;${this.osm_location.lat},${this.osm_location.lon}`;
      directions_url += "&engine=fossgis_osrm_bike";
    }

    // Opening hours
    var open_now = "???", open_now_colour = "black";
    var isOpen = this._isOpenNow();
    if( isOpen === true ) {
      open_now = "Open"; open_now_colour = "green";
    }
    else if( isOpen === false ) {
      open_now = "Closed"; open_now_colour = "red";
    }

    // Group the colouring by Status
    var filter = x => x.status === this.status;

    const website = this.osm_details ? this.osm_details.website : "";
    const url = this.osm_location ?
      `https://www.openstreetmap.org/${this.osm_location.osm_type}/${this.osm_location.osm_id}` : "";

    // Parse opening hours for display
    var openingHoursDisplay = [];
    if( this.osm_details && this.osm_details.opening_hours ) {
      try {
        if( typeof opening_hours !== 'undefined' ) {
          var oh = new opening_hours(this.osm_details.opening_hours);
          // Get a human-readable version
          openingHoursDisplay = [this.osm_details.opening_hours];
        }
      }
      catch( e ) {
        openingHoursDisplay = [this.osm_details.opening_hours];
      }
    }

    // Build and return template
    var data = {
      name:          this.raw_data.Name,
      type:          this.raw_data.Type,
      address:       this.osm_location ? this.osm_location.display_name : this.raw_data.Address,
      avgScore:      this.avg_score.toFixed( 2 ),
      minAvgScore:   PlacesDB.minAvgScore( filter ),
      maxAvgScore:   PlacesDB.maxAvgScore( filter ),
      score:         this.raw_data.Score || "",
      expectation:   this.raw_data.Expectation || "",
      imgUrl:        "",  // No images from OSM
      openNow:       open_now,
      openNowColour: open_now_colour,
      openingHours:  openingHoursDisplay,
      website:       website,
      url:           url,
      directionsUrl: directions_url
    };

    var hndl_template = Handlebars.compile( $('#place-template')[0].innerHTML );
    return hndl_template( data );
  }

  /**
   * Gets a string representation of the object
   */
  toString() {
    return `${this.raw_data.Country}/${this.raw_data.City}/${this.raw_data.Name}`;
  }
}
