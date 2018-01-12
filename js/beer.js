"use strict";

/**
 * Stores of all the Beer Places and some additional information
 */
function BeerPlacesDB( YAMLData ) {
  this.places = new Array();
  var timer;

  /**
   * Checks that the raw data for a a place has got all the fields
   */
  this.checkPlaceData = function( rawPlaceData ) {
    // Check for "Name"
    if( !'Name' in beerPlace || !beerPlace.Name ) {
      return false;
    }
    // Check for "Address"
    if( !'Address' in beerPlace || !beerPlace.Address ) {
      return false;
    }
    // Check for "Type"
    if( !'Type' in beerPlace || !beerPlace.Type ) {
      return false;
    }
    // Check for "Status"
    if( !'Status' in beerPlace || !beerPlace.Status ) {
      return false;
    }

    if( beerPlace.Status.toLowerCase() === "to try" ) {
      // Check for "Expectation"
      if( !'Expectation' in beerPlace || !beerPlace.Expectation ) {
        return false;
      }
      // Check for "Expectation.Mine"
      if( !'Mine' in beerPlace || !beerPlace.Expectation.Mine ) {
        return false;
      }
      // Check for "Expectation.Google"
      if( !'Google' in beerPlace || !beerPlace.Expectation.Google ) {
        return false;
      }
    }

    if( beerPlace.Status.toLowerCase() === "tried" ) {
      // Check for "Score"
      if( !'Score' in beerPlace || !beerPlace.Score ) {
        return false;
      }
    }

    return true;
  }

  // Scan all the YAML results and build objects
  for ( var country in YAMLData ) {
    var countryCities = YAMLData[ country ];
    for ( var city in countryCities ) {
      var cityPlaces = countryCities[ city ];
      for ( var place in cityPlaces ) {
        var beerPlace = cityPlaces[ place ];
        if ( DEBUG && !city.match( DEBUG_CITY ) ) {
          continue;
        }
        if( !this.checkPlaceData(beerPlace) ) {
          console.warn(`Missing information on entry ${JSON.stringify(beerPlace)}`);
          continue;
        }
        this.places.push( new BeerPlace( beerPlace, country, city ) );
      }
    }
  }

  // Properties with statistical data
  this.places = this.places.sort();

  /**
   * A fingerprint of the Database data, excluding Google data
   */
  this.placesHash = ( function () {
    var hashes = this.places.map( x => x.dataHash );
    return objectHash.sha1(
      JSON.stringify( hashes )
    );
  } ).apply( this );

  /**
   * The highest average amongst all places, given a filter on places
   */
  this.maxAverageScore = function ( filterCallback = x => true ) {
    return this.places
      .filter( filterCallback )
      .map( x => x.averageScore )
      .reduce( ( x1, x2 ) => Math.max( x1, x2 ), 0.0 );
  }

  /**
   * The lowest average amongst all places, given a filter on places
   */
  this.minAverageScore = function ( filterCallback = x => true ) {
    return this.places
      .filter( filterCallback )
      .map( x => x.averageScore )
      .reduce( ( x1, x2 ) => Math.min( x1, x2 ), 10.0 );
  }

  /**
   * Starts the filling of the Beer Places DB
   */
  this.fillDB = function () {
    if ( this.loadCache() ) {
      for ( var i in this.places ) {
        this.addMarker( this.places[ i ] );
      }
      this.saveCache();
    }
    else {
      this.queryForLocations();
    }
  }

  /**
   * Loads the cache into the local beer DB
   */
  this.loadCache = function () {
    // Check cache enabled
    if ( !CACHE_ENABLED ) {
      localStorage.removeItem( "BeerPlacesDB" );
      localStorage.removeItem( "BeerPlacesDBHash" );
      localStorage.removeItem( "BeerPlacesDBTimestamp" );
      return false;
    }

    var cache = localStorage.getItem( "BeerPlacesDB" );
    if ( cache ) {
      var cacheHash = localStorage.getItem( "BeerPlacesDBHash" );
      var cacheTimestamp = parseInt( localStorage.getItem( "BeerPlacesDBTimestamp" ) || 0 );

      // Check expiry
      var expired = ( new Date().getTime() - cacheTimestamp ) >= CACHE_DURATION * 1000;
      if ( expired ) {
        console.info( `Cache expired.` )
        return false;
      }

      // Check hash
      var hashMatch = this.placesHash === cacheHash;
      if ( !hashMatch ) {
        console.info( `Cache found (${cacheHash}) but doesn't match data (${this.placesHash}).` )
        return false;
      }

      // Load
      var places = JSON.parse( cache );

      // Convert the cache into proper BeerPlace objects
      this.places = new Array();
      for ( var i in places ) {
        this.places.push(
          new BeerPlace( places[ i ], places[ i ].country, places[ i ].city )
        );
      }

      console.info( `Found and loaded cache ${cacheHash}` )
      return true;
    }
    return false;
  }

  /**
   * Saves the DB places into the cache
   */
  this.saveCache = function () {
    // Check cache enabled
    if ( !CACHE_ENABLED ) {
      localStorage.removeItem( "BeerPlacesDB" );
      localStorage.removeItem( "BeerPlacesDBHash" );
      localStorage.removeItem( "BeerPlacesDBTimestamp" );
      return false;
    }

    var data = JSON.stringify( this.places );
    var dataHash = this.placesHash;
    var timestamp = new Date().getTime();

    console.info( `Saving cache for DB ${dataHash}` )

    localStorage.setItem( "BeerPlacesDB", data )
    localStorage.setItem( "BeerPlacesDBHash", dataHash )
    localStorage.setItem( "BeerPlacesDBTimestamp", timestamp )

    return true;
  }

  /**
   * Loads asynchronously the information about the location of all the places
   */
  this.queryForLocations = function () {
    var startQueue = this.places.slice();
    var endQueue = new Array();
    var thisRef = this;

    // Stats
    var start = new Date().getTime();
    var queries = 0,
      failures = 0;
    // Run task
    processQueueAsync(
      startQueue,
      endQueue,
      place => place.queryLocation.bind( place ),
      google.maps.places.PlacesServiceStatus.OK,
      place => {
        this.addMarker.call( this, place )
        queries++;
      },
      ( place, error ) => {
        console.error( `Error querying location for ${place.Name}: ${error}` );
        failures++;
        // In case of ZERO_RESULTS, drop the item
        var doneItem = startQueue.shift();
        if ( endQueue != undefined ) {
          endQueue.push( doneItem );
        }
      },
      place => {
        var time = ( new Date().getTime() - start ) / 1000.0;

        console.info( `All locations done: items=${endQueue.length}, queries=${queries}, failures=${failures}, time=${time.toFixed(3)}s.` );
        thisRef.places = endQueue;

        // Run next query
        thisRef.queryForDetails();
      }
    );
  }

  /**
   * Loads asynchronously the information about the location of all the places
   */
  this.queryForDetails = function () {
    var startQueue = this.places.slice();
    var endQueue = new Array();
    var thisRef = this;

    // Stats
    var start = new Date().getTime();
    var queries = 0,
      failures = 0;
    // Run task
    processQueueAsync(
      startQueue,
      endQueue,
      place => place.queryDetails.bind( place ),
      google.maps.places.PlacesServiceStatus.OK,
      place => {
        queries++;
      },
      ( place, error ) => {
        console.error( `Error querying details for ${place.Name}: ${error}` );
        failures++;
      },
      place => {
        var time = ( new Date().getTime() - start ) / 1000.0;

        console.info( `All details done: items=${endQueue.length}, queries=${queries}, failures=${failures}, time=${time.toFixed(3)}s.` );
        thisRef.places = endQueue;

        thisRef.saveCache()
      }
    );
  }

  /**
   * Adds a Beer Place as a marker on the map
   */
  this.addMarker = function ( place ) {
    // Build the pin
    var pinColour = this.pinColour( place );
    var icon = "http://chart.apis.google.com/chart?chst=d_map_pin_letter&chld=%E2%80%A2|" + pinColour;
    var pinImage = new google.maps.MarkerImage(
      icon,
      new google.maps.Size( 21, 34 ),
      new google.maps.Point( 0, 0 ),
      new google.maps.Point( 10, 34 )
    );

    // Create and add the marker
    var title = `${place.Name} - ${place.averageScore.toFixed(2)}/10`;
    var marker = new google.maps.Marker( {
      map: map,
      title: title,
      icon: pinImage,
      position: place.GoogleLocation.geometry.location,
      infoWindow: infoWindow
    } );

    // Manage the click
    marker.addListener( 'click', () => {
      infoWindow.setContent( place.placeInfoWindow() );
      infoWindow.open( map, marker );
      // Build the stars
      $( function () {
        $( 'span.stars' ).stars();
      } );
      console.info( place );
    } );
  }

  /**
   *   Calculates the colour of the pin.
   */
  this.pinColour = function ( place ) {
    // Group the colouring by Status
    var filter = x => x.Status.toLowerCase() === place.Status.toLowerCase();

    // Find range min and max
    place.maxAverageScore = this.maxAverageScore(filter);
    place.minAverageScore = this.minAverageScore(filter);

    // Calculate percentage
    var colourPercentage = rangeRelative(
      place.minAverageScore,
      place.averageScore,
      place.maxAverageScore
    );

    // Calculate the colour on the gradient
    var colour = getGradientColor(
      PINS[place.Status.toLowerCase()][0],
      PINS[place.Status.toLowerCase()][1],
      colourPercentage
    );

    return colour;
  }
}

/**
 * Represents a Beer Place
 */
function BeerPlace( rawPlaceData, country, city ) {
  Object.assign( this, rawPlaceData );

  this.country = country;
  this.city = city;

  /**
   * A fingerprint of the object, excluding Google data
   */
  this.dataHash = objectHash.sha1( rawPlaceData );

  /**
   * The average score of the place
   */
  this.averageScore = (function () {
    // Missing status
    if ( !this.Status ) {
      console.error( `Missing Status for "${this.Name}"` )
      return 0.0;
    }

    var average = 0.0;
    var count = 0;
    var penalty = 0.0;

    if ( this.Status.toLowerCase() === 'tried' ) {
      // Draught score (weight of 33%)
      if ( 'Draught' in this.Score ) {
        if ( this.Score.Draught > 0.0 ) {
          average += this.Score.Draught * 3.0;
          count += 3;
        }
        else penalty = 0.33;
      }

      // Bottles score (weight of 33%)
      if ( 'Bottles' in this.Score ) {
        if ( this.Score.Bottles > 0.0 ) {
          average += this.Score.Bottles * 3.0;
          count += 3;
        }
        else penalty = 0.33;
      }

      // Place score (weight of 22%)
      if ( 'Place' in this.Score ) {
        if ( this.Score.Place > 0.0 ) {
          average += this.Score.Place * 2.0;
          count += 2;
        }
        else penalty = 0.22;
      }

      // Food score (weight of 11%)
      if ( 'Food' in this.Score ) {
        if ( this.Score.Food > 0.0 ) {
          average += this.Score.Food * 1.0;
          count += 1;
        }
        else penalty = 0.11;
      }

      // Final calculations
      average /= count;
      average -= penalty;
    }
    else if ( this.Status.toLowerCase() === 'to try' ) {
      // Personal score (weight of 60%)
      if ( 'Mine' in this.Expectation ) {
        average += this.Expectation.Mine * 3.0;
        count += 3;
      }

      // Google score, ranges from 0 to 5 (weight of 40%)
      if ( 'Google' in this.Expectation ) {
        average += this.Expectation.Google * 4.0;
        count += 2;
      }

      // Final calculations
      average /= count;
      average -= penalty;
    }

    return average
  } ).apply( this );

  /**
   * Queries Google to fetch information about the position and then calls a
   * callback function when the data is available.
   */
  this.queryLocation = function ( callback, force = false ) {
    // Merges the location information provided by Google into this object
    function mergeLocation( googleLocation ) {
      var photoUrl = ""
      if ( googleLocation.photos.length > 0 ) {
        photoUrl = googleLocation.photos[ 0 ].getUrl( {
          'maxHeight': 100,
          'maxWidth': 150,
        } );
      }

      this.GoogleLocation = {
        place_id: googleLocation.place_id,
        formatted_address: googleLocation.formatted_address,
        geometry: googleLocation.geometry,
        name: googleLocation.name,
        opening_hours: googleLocation.opening_hours,
        open_now: googleLocation.open_now,
        rating: googleLocation.rating,
        photoUrl: photoUrl
      };
    }

    // Skip if already present
    if ( this.GoogleLocation && !force ) {
      console.warn( `Location data already loaded for ${this.Name}` );
      return;
    }

    var request = {
      'query': `${this.Name}, ${this.Address}`
    };
    placesService.textSearch( request, ( results, status ) => {
      console.info( `Text search completed for "${this.Name}" with status ${status}` );

      if ( status === google.maps.places.PlacesServiceStatus.OK ) {
        mergeLocation.call( this, results[ 0 ] );
        console.info( `Found ID for "${this.Name}": ${this.GoogleLocation.place_id}` );
      }

      if ( callback ) {
        callback( this, status );
      }
    } );
  }

  /**
   * Queries Google for detaiDeliriumled information about the place and then calls a
   * callback function when the data is available.
   */
  this.queryDetails = function ( callback, force = false ) {
    // Merges the details information provided by Google into this object
    function mergeDetails( googleDetails ) {
      this.GoogleDetails = {}
      Object.assign( this.GoogleDetails, googleDetails );
    }

    // Skip if details are missing
    if ( !this.GoogleLocation ) {
      console.error( `Can't load Details because Location is missing for ${this.Name}` );
      return;
    }
    // Skip if already present
    if ( this.GoogleDetails && !force ) {
      console.warn( `Details data already loaded for ${this.Name}` );
      return;
    }

    var request = {
      'placeId': this.GoogleLocation.place_id
    };
    placesService.getDetails( request, ( results, status ) => {
      console.info( `Details search completed for "${this.Name}" with status ${status}` );

      if ( status === google.maps.places.PlacesServiceStatus.OK ) {
        mergeDetails.call( this, results );
        console.info( `Found details for "${this.Name}".` );
      }

      if ( callback ) {
        callback( this, status );
      }
    } );
  }

  /**
   * Build the InfoWindow content for the place
   */
  this.placeInfoWindow = function () {
    var hndPlaceInfo = Handlebars.compile(
      $( '#place-template' )[ 0 ].innerHTML
    );

    return hndPlaceInfo( {
      name: this.Name,
      averageScore: this.averageScore.toFixed( 2 ),
      minAverageScore: this.minAverageScore,
      maxAverageScore: this.maxAverageScore,
      address: this.GoogleLocation.formatted_address,
      type: this.Type,
      score: this.Score || "",
      expectation: this.Expectation || "",
      imgUrl: this.GoogleLocation.photoUrl || "",
      website: this.GoogleDetails ? this.GoogleDetails.website : ""
    } );
  }
}