"use strict";

/**
 * Stores of all the Beer Places and some additional information
 */
function BeerPlacesDB( YAMLData ) {
  this.places = new Array();
  var timer;

  // Scan all the YAML results and build objects
  for ( var country in YAMLData ) {
    var countryCities = YAMLData[ country ];
    for ( var city in countryCities ) {
      var cityPlaces = countryCities[ city ];
      for ( var place in cityPlaces ) {
        var beerPlace = cityPlaces[ place ];
        if ( city.match( DEBUG_CITY ) || !DEBUG ) {
          this.places.push( new BeerPlace( beerPlace, country, city ) );
        }
      }
    }
  }

  // Properties with statistical data
  this.places = this.places.sort();
  this.averages = this.places.map( i => i.averageScore() );
  this.averageMax = this.averages.reduce( ( a, b ) => Math.max( a, b ) );
  this.averageMin = this.averages.reduce( ( a, b ) => Math.min( a, b ) );

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
   * Starts the filling of the Beer Places DB
   */
  this.fillDB = function () {
    if ( this.loadCache() ) {
      // DB is loaded, but the pins are not displayed!
      for ( var i in this.places ) {
        this.addMarker( this.places[ i ] );
      }
      this.saveCache();
    }
    else {
      // Start the queries to Google
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
      var expired = (new Date().getTime() - cacheTimestamp) >= CACHE_DURATION * 1000;
      var hashMatch = this.placesHash == cacheHash;

      if ( expired ) {
        console.info( `Cache expired.` )
        return false;
      }
      if ( !hashMatch ) {
        console.info( `Cache found (${cacheHash}) but doesn't match data (${this.placesHash}).` )
        return false;
      }

      var places = JSON.parse( cache );

      // Convert the cache into proper BeerPlace objects
      this.places = new Array();
      for ( var i in places ) {
        var place = places[ i ];
        this.places.push( new BeerPlace( place, place.country, place.city ) );
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
    var startQueue = this.places;
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

        console.info( `All letails done: items=${endQueue.length}, queries=${queries}, failures=${failures}, time=${time.toFixed(3)}s.` );
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
    var title = `${place.Name} - ${place.averageScore().toFixed(2)}/10`;
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
    function toColorHex( number ) {
      number = Math.max( Math.min( parseInt( number ), 255 ), 0 )
      let str = number.toString( 16 );
      return "0".repeat( 2 - str.length ) + str;
    }

    var range = 10.0 / ( this.averageMax - this.averageMin )
    range = Math.min( Math.max( 0.0, range ), 10.0 );
    var colour = ( place.averageScore() - this.averageMin ) * range;
    colour = 255 - ( colour * 255 / 10.0 );
    colour = toColorHex( colour );

    var pinColour = "FF";
    if ( place.Status.toLowerCase() == 'tried' ) {
      pinColour = `${colour}FF${colour}`;
    }
    else if ( place.Status.toLowerCase() == 'to try' ) {
      pinColour = `${colour}${colour}FF`;
    }

    return pinColour;
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
  this.averageScore = function () {
    var average = 0.0;
    var count = 0;

    // Missing status
    if ( !this.Status ) {
      console.error( `Missing status for "${this.Name}"` )
      return 0.0;
    }

    if ( this.Status.toLowerCase() == 'tried' ) {
      if ( 'Draught' in this.Score ) {
        average += this.Score.Draught * 3.0;
        count += 3;
      }
      if ( 'Bottles' in this.Score ) {
        average += this.Score.Bottles * 3.0;
        count += 3;
      }
      if ( 'Place' in this.Score ) {
        average += this.Score.Place * 2.0;
        count += 2;
      }
      if ( 'Food' in this.Score ) {
        average += this.Score.Food * 1.0;
        count += 1;
      }
      average /= count;
    }
    else if ( this.Status.toLowerCase() == 'to try' ) {
      average = ( this.Expectation.Mine +
        this.Expectation.Google * 2.0 ) / 2.0;
    }

    return average
  }

  /**
   * Queries Google to fetch information about the position and then calls a
   * callback function when the data is available.
   */
  this.queryLocation = function ( callback ) {
    var request = {
      'query': `${this.Name}, ${this.Address}`
    };

    placesService.textSearch( request, ( results, status ) => {
      console.info( `Text search completed for "${this.Name}" with status ${status}` );

      if ( status == google.maps.places.PlacesServiceStatus.OK ) {
        this.incorporateLocation( results[ 0 ] );
        console.info( `Found ID for "${this.Name}": ${this.GoogleLocation.place_id}` );
      }

      if ( callback ) {
        callback( this, status );
      }
    } );
  }

  /**
   * Incorporates the location information provided by Google into this object
   */
  this.incorporateLocation = function ( googleLocation ) {
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

  /**
   * Queries Google for detaiDeliriumled information about the place and then calls a
   * callback function when the data is available.
   */
  this.queryDetails = function ( callback ) {
    if ( !this.GoogleLocation ) {
      return;
    }

    var request = {
      'placeId': this.GoogleLocation.place_id
    };
    placesService.getDetails( request, ( results, status ) => {
      console.info( `Details search completed for "${this.Name}" with status ${status}` );

      if ( status == google.maps.places.PlacesServiceStatus.OK ) {
        this.incorporateDetails( results[ 0 ] );
        console.info( `Found details for "${this.Name}".` );
      }

      if ( callback ) {
        callback( this, status );
      }
    } );
  }

  /**
   * Incorporates the details information provided by Google into this object
   */
  this.incorporateDetails = function ( googleDetails ) {
    Object.assign( this, googleDetails );
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
      averageScore: this.averageScore().toFixed( 2 ),
      address: this.GoogleLocation.formatted_address,
      type: this.Type,
      score: this.Score || "",
      expectation: this.Expectation || "",
      imgUrl: this.GoogleLocation.photoUrl || "",
      website: this.website || ""
    } );
  }
}