/*
MIT License

Copyright (c) 2018-2025 Fabrizio Colonna <colofabrix@tin.it>

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
    // Interpreting YAML data as first thing
    local_db = _parseYaml( raw_data );

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
      google.maps.places.PlacesServiceStatus.OK,
      /* successAction */
      ( place ) => {
        Logger.trace( `Adding ${place.toString()} to the map` );
        addPlaceToMap( place );
        queries++;
      },
      /* failAction */
      ( place, error ) => {
        if( error === google.maps.places.PlacesServiceStatus.OVER_QUERY_LIMIT ) {
          // In case of Google throttling us, retry
          Logger.error( `Google throttling error for ${place.toString()}: ${error}` );
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

        // Run next query
        _queryForDetails();
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
      google.maps.places.PlacesServiceStatus.OK,
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
   * Converts a database of point into data for Google heatmap
   */
  var _db2heatmap = function( data ) {
    // Centering the averages of the two types of places
    var filter = x => x.status === "to try";
    var avgToTryScore = avgAvgScore( filter );
    var minToTryScore = minAvgScore( filter ) - avgToTryScore;
    var maxToTryScore = maxAvgScore( filter ) - avgToTryScore;

    var filter = x => x.status === "tried";
    var avgTriedScore = avgAvgScore( filter );
    var minTriedScore = minAvgScore( filter ) - avgTriedScore;
    var maxTriedScore = maxAvgScore( filter ) - avgTriedScore;

    data = data.map( function(place) {
      if( !place.google_location ) {
        return { location: null, weight: 0.0 }
      };

      // Rescaling weight
      var weight = place.avg_score;
      if( place.status === "to try" ) {
        weight -= avgToTryScore;
        weight = rescalePoint(weight, minToTryScore, maxToTryScore)
      }
      else if( place.status === "tried" ) {
        weight -= avgTriedScore;
        weight = rescalePoint(weight, minTriedScore, maxTriedScore)
      }

      // Location of the point
      var location = {
        lat: place.google_location.geometry.location.lat,
        lng: place.google_location.geometry.location.lng
      };
      if( place.google_location.geometry.location instanceof google.maps.LatLng ) {
        location = place.google_location.geometry.location.toJSON();
      }

      // Result
      return {
        location: new google.maps.LatLng( location ),
        weight: weight
      };
    });

    return data;
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
   * Request the toggle of the Heatmap
   */
  var toggleHeatmap = function() {
    var points = _db2heatmap(local_db);
    GoogleMap.toggleHeatmap( points );
  };

  /**
   * A fingerprint of the Database data, excluding Google data
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
      google_details: json_object.google_details,
      google_location: json_object.google_location
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
   * Queries Google to fetch information about the position and then calls a
   * callback function when the data is available.
   */
  queryLocation( callback, force = false ) {
    // Skip if already present
    if( this.google_location && !force ) {
      Logger.warn( `Location data already loaded for ${this.toString()}` );
      if( callback ) {
        callback( this, google.maps.places.PlacesServiceStatus.OK );
      }
      return;
    }

    var thisRef = this;
    var request = { 'query': `${this.raw_data.Name}, ${this.raw_data.Address}` };
    GoogleMap.placesService().textSearch( request, ( results, status ) => {
      Logger.info( `Text search completed for "${this.toString()}" with status ${status}` );

      if( status === google.maps.places.PlacesServiceStatus.OK ) {
        results = results[0];

        var photo_url = ""
        if( results.photos && results.photos.length > 0 ) {
          photo_url = results.photos[0].getUrl({ 'maxHeight': 100, 'maxWidth': 150 });
        }

        thisRef.google_location = {
          place_id: results.place_id,
          formatted_address: results.formatted_address,
          geometry: results.geometry,
          name: results.name,
          opening_hours: results.opening_hours,
          open_now: results.open_now,
          rating: results.rating,
          photoUrl: photo_url
        };

        Logger.info( `Found location for "${this.toString()}": ${this.google_location.place_id}` );
        Logger.debug( `Google location for "${this.toString()}"`, this.google_location );
      }

      if( callback ) {
        callback( this, status );
      }
    });
  }

  /**
   * Queries Google for detailed information about the place and then calls a
   * callback function when the data is available.
   */
  queryDetails( callback, force = false ) {
    if( !this.google_location ) {
      Logger.debug( this );
      Logger.error( `Can't load Details because Location is missing for ${this.raw_data.Name}` );
      if( callback ) {
        callback( this, null );
      }
      return;
    }
    if( this.google_details && !force ) {
      Logger.warn( `Details data already loaded for ${this.raw_data.Name}` );
      if( callback ) {
        callback( this, google.maps.places.PlacesServiceStatus.OK );
      }
      return;
    }

    var thisRef = this;
    var request = { 'placeId': this.google_location.place_id };
    GoogleMap.placesService().getDetails( request, ( results, status ) => {
      Logger.info( `Details search completed for "${this.raw_data.Name}" with status ${status}` );

      if( status === google.maps.places.PlacesServiceStatus.OK ) {
        thisRef.google_details = {}
        Object.assign( thisRef.google_details, results );
        Logger.info( `Found details for "${this.raw_data.Name}".` );
        Logger.debug( `Details for "${this.raw_data.Name}".`, thisRef.google_details );
      }

      if( callback ) {
        callback( this, status );
      }
    });
  }

  /**
   * Build the InfoWindow content for the place
   */
  htmlDetails() {
    // See https://developers.google.com/maps/documentation/urls/guide
    var directions_url = (isSSL() ? "https" : "http") + "://www.google.com/maps/dir/?api=1";
    directions_url += "&destination=" + encodeURI(this.google_location.formatted_address)
    directions_url += "&travelmode=bicycling"      // Options are driving, walking, bicycling or transit

    // Opening hours
    var open_now = "???", open_now_colour = "black";
    if( this.google_details && this.google_details.opening_hours ) {
      if( this.google_details.opening_hours.open_now ) {
        open_now = "Open"; open_now_colour = "green";
      }
      else {
        open_now = "Closed"; open_now_colour = "red";
      }
    }

    // Group the colouring by Status
    var filter = x => x.status === this.status;

    const website = this.google_details ? this.google_details.website : "";
    const url = this.google_details ? this.google_details.url : ""
    const openingHours =
      this.google_details ?
        this.google_details.opening_hours ?
          this.google_details.opening_hours.weekday_text :
          [] :
        [];

    // Build and return template
    var data = {
      name:          this.raw_data.Name,
      type:          this.raw_data.Type,
      address:       this.google_location.formatted_address,
      avgScore:      this.avg_score.toFixed( 2 ),
      minAvgScore:   PlacesDB.minAvgScore( filter ),
      maxAvgScore:   PlacesDB.maxAvgScore( filter ),
      score:         this.raw_data.Score || "",
      expectation:   this.raw_data.Expectation || "",
      imgUrl:        this.google_location.photoUrl || "",
      openNow:       open_now,
      openNowColour: open_now_colour,
      openingHours:  openingHours,
      website:       website,
      url:           url,
      directionsUrl: directions_url
    };
    console.log(data);
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
