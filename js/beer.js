"use strict";

/**
 * Stores of all the Beer Places and some additional information
 */
var PlacesDB = (function() {

  var Cache = (function() {
    /**
     * Loads the cache into the local beer DB
     */
    var load = function() {
      // Check cache enabled
      if( !CACHE_ENABLED ) {
        reset()
        return false;
      }

      Logger.info("Looking for saved cache");

      var cache = window.localStorage.getItem( "BeerPlacesDB" );
      if( cache ) {
        var cache_hash = window.localStorage.getItem( "BeerPlacesDBHash" );
        var cache_timestamp = parseInt( window.localStorage.getItem( "BeerPlacesDBTimestamp" ) || 0 );

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
        var places = JSON.parse( cache );

        // Convert the cache into proper BeerPlace objects
        local_db = new Array();
        for( var place of places ) {
          local_db.push( place );
        }

        Logger.info( `Found and loaded cache ${cache_hash}` )
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
        reset()
        return false;
      }

      Logger.info( `Saving cache for DB ${dbHash()}` )

      window.localStorage.setItem( "BeerPlacesDB", JSON.stringify(local_db) )
      window.localStorage.setItem( "BeerPlacesDBHash", dbHash() )
      window.localStorage.setItem( "BeerPlacesDBTimestamp", new Date().getTime() )

      return true;
    };

    /**
     * Resets the local cache
     */
    var reset = function() {
      if( CACHE_ENABLED ) {
        window.localStorage.removeItem( "BeerPlacesDB" );
        window.localStorage.removeItem( "BeerPlacesDBHash" );
        window.localStorage.removeItem( "BeerPlacesDBTimestamp" );
        Logger.log( "Cache cleaned" );
      }
      else {
        Logger.log( "The cache is not enabled" );
      }
    };

    return {
      'load': load,
      'save': save,
      'reset': reset
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
      for( var place of local_db ) {
        addPlaceToMap( place );
      }
      Cache.save();
    }
    else {
      _queryForLocations();
    }
  };

  /**
   * Scan all the YAML results and build the database
   */
  var _parseYaml = function( yaml_data ) {
    var result = new Array();

    for( var country in yaml_data ) {
      var country_cities = yaml_data[country];
      for( var city in country_cities ) {
        var city_places = country_cities[city];
        for( var place in city_places ) {
          var beer_place = city_places[place];
          if( DEBUG && !city.match( DEBUG_CITY ) ) {
            continue;
          }
          // Check the data is valid, if not don't add it
          if( !_checkRawData(beer_place) ) {
            Logger.warn(`Missing information on entry ${JSON.stringify(beer_place)}`);
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
        addPlaceToMap( place );
        queries++;
      },
      /* failAction */
      ( place, error ) => {
        Logger.error( `Error querying location for ${place.Name}: ${error}` );
        failures++;
        // In case of ZERO_RESULTS, drop the item
        if( error === google.maps.places.PlacesServiceStatus.ZERO_RESULTS ) {
          var done_item = start_queue.shift();
          Logger.warn( `No results found for ${done_item.name}, skipping place.` );
          if( end_queue != undefined ) {
            end_queue.push( done_item );
          }
        }
      },
      /* doneAction */
      ( place ) => {
        var time = ( new Date().getTime() - start ) / 1000.0;

        Logger.warn( `All locations done: items=${end_queue.length}, queries=${queries}, failures=${failures}, time=${time.toFixed(3)}s.` );
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
        Logger.error( `Error querying details for ${place.Name}: ${error}` );
        failures++;
      },
      /* doneAction */
      ( place ) => {
        var time = ( new Date().getTime() - start ) / 1000.0;

        Logger.warn( `All details done: items=${end_queue.length}, queries=${queries}, failures=${failures}, time=${time.toFixed(3)}s.` );
        local_db = end_queue;

        Cache.save()
      }
    );
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
  var maxAvgScore = function( filter_callback = x => true ) {
    return local_db
      .filter( filter_callback )
      .map( x => x.avg_score )
      .reduce( ( x1, x2 ) => Math.max( x1, x2 ), 0.0 );
  };

  /**
   * The lowest average amongst all places, given a filter on places
   */
  var minAvgScore = function( filter_callback = x => true ) {
    return local_db
      .filter( filter_callback )
      .map( x => x.avg_score )
      .reduce( ( x1, x2 ) => Math.min( x1, x2 ), 10.0 );
  };

  /**
   * Requests the addition of a marker on the map
   */
  var addPlaceToMap = function( place ) {
    // Group the colouring by Status
    var status = place.Status.toLowerCase();
    var filter = x => x.Status.toLowerCase() === status;

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
    'init': init,
    'dbHash': dbHash,
    'maxAvgScore': maxAvgScore,
    'minAvgScore': minAvgScore,
    'Cache': Cache
  };
})();


/**
 * Represents a Beer Place with its information and data
 */
class BeerPlace {
  /**
   * Constructor
   */
  constructor( raw_data, country, city ) {
    this.raw_data = raw_data;
    this.country = country;
    this.city = city;

    // The YAML data is also assigned as parent level set of members
    Object.assign( this, raw_data );

    this.data_hash = this._dataHash();
    this.avg_score = this._avgScore();
  }

  /**
   * Creates a BeerPlace from a JSON string
   */
  static loadFromJSON( json_string ) {
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
    if( !this.Status ) {
      Logger.error( `Missing Status for "${this.Name}"` )
      return 0.0;
    }

    var average = 0.0;
    var count = 0;
    var penalty = 0.0;

    if( this.Status.toLowerCase() === 'tried' ) {
      // Draught score (weight of 33%)
      if( 'Draught' in this.Score ) {
        if( this.Score.Draught > 0.0 ) {
          average += this.Score.Draught * 3.0;
          count += 3;
        }
        else penalty = 0.33;
      }

      // Bottles score (weight of 33%)
      if( 'Bottles' in this.Score ) {
        if( this.Score.Bottles > 0.0 ) {
          average += this.Score.Bottles * 3.0;
          count += 3;
        }
        else penalty = 0.33;
      }

      // Place score (weight of 22%)
      if( 'Place' in this.Score ) {
        if( this.Score.Place > 0.0 ) {
          average += this.Score.Place * 2.0;
          count += 2;
        }
        else penalty = 0.22;
      }

      // Food score (weight of 11%)
      if( 'Food' in this.Score ) {
        if( this.Score.Food > 0.0 ) {
          average += this.Score.Food * 1.0;
          count += 1;
        }
        else penalty = 0.11;
      }

      // Final calculations
      average /= count;
      average -= penalty;
    }
    else if( this.Status.toLowerCase() === 'to try' ) {
      // Personal score (weight of 60%)
      if( 'Mine' in this.Expectation ) {
        average += this.Expectation.Mine * 3.0;
        count += 3;
      }

      // Google score, ranges from 0 to 5 (weight of 40%)
      if( 'Google' in this.Expectation ) {
        average += this.Expectation.Google * 4.0;
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
      Logger.warn( `Location data already loaded for ${this.Name}` );
      return;
    }

    var thisRef = this;
    var request = { 'query': `${this.Name}, ${this.Address}` };
    GoogleMap.placesService().textSearch( request, ( results, status ) => {
      Logger.info( `Text search completed for "${this.Name}" with status ${status}` );

      if( status === google.maps.places.PlacesServiceStatus.OK ) {
        results = results[0];

        var photo_url = ""
        if( results.photos.length > 0 ) {
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

        Logger.info( `Found location for "${this.Name}": ${this.google_location.place_id}` );
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
      Logger.error( `Can't load Details because Location is missing for ${this.Name}` );
      return;
    }
    if( this.google_details && !force ) {
      Logger.warn( `Details data already loaded for ${this.Name}` );
      return;
    }

    var thisRef = this;
    var request = { 'placeId': this.google_location.place_id };
    GoogleMap.placesService().getDetails( request, ( results, status ) => {
      Logger.info( `Details search completed for "${this.Name}" with status ${status}` );

      if( status === google.maps.places.PlacesServiceStatus.OK ) {
        thisRef.google_details = {}
        Object.assign( thisRef.google_details, results );
        Logger.info( `Found details for "${this.Name}".` );
      }

      if( callback ) {
        callback( this, status );
      }
    });
  }

  /**
   * Build the InfoWindow content for the place
   */
  getIWTemplate() {
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
    var filter = x => x.Status.toLowerCase() === this.Status.toLowerCase();

    // Build and return template
    var hndl_template = Handlebars.compile($('#place-template')[0].innerHTML);
    return hndl_template({
      name:          this.Name,
      type:          this.Type,
      address:       this.google_location.formatted_address,
      avgScore:      this.avg_score.toFixed( 2 ),
      minAvgScore:   PlacesDB.minAvgScore( filter ),
      maxAvgScore:   PlacesDB.maxAvgScore( filter ),
      score:         this.Score || "",
      expectation:   this.Expectation || "",
      imgUrl:        this.google_location.photoUrl || "",
      hasDetails:    'google_details' in this,
      openNow:       open_now,
      openNowColour: open_now_colour,
      website:       this.google_details ? this.google_details.website : "",
      url:           this.google_details ? this.google_details.url : "",
      directionsUrl: directions_url
    });
  }
}
