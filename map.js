"use strict";


const BEER_DATABASE_FILE = "database.yml"

var beerDb;
var map, infoWindow, placesService;


/**
 * Initializes Google Map
 */
function initGoogle() {
  /**
   * Sets the home position on the Map
   */
  var setHome = function( homePos ) {
    // Add centre marker
    var homeImage = new google.maps.MarkerImage(
      'https://maps.google.com/mapfiles/kml/shapes/arrow.png'
    );
    var homeMarker = new google.maps.Marker( {
      icon: homeImage,
      clickable: false,
      map: map,
      position: pos
    } );
    map.setCenter( pos );
  }

  // Create objects
  map = new google.maps.Map(
    $( '#map' )[ 0 ], {
      maxZoom: 18,
      minZoom: 2,
      zoom: 12,
      mapTypeId: google.maps.MapTypeId.ROADMAP
    }
  );
  infoWindow = new google.maps.InfoWindow;
  placesService = new google.maps.places.PlacesService( map );

  // Add legend to the map
  map.controls[ google.maps.ControlPosition.RIGHT_TOP ].push(
    $( '#legend' )[ 0 ]
  );

  // Center the map on the current position
  var pos = new google.maps.LatLng( 51.5189138, -0.0924759 );
  if ( navigator.geolocation ) {
    navigator.geolocation.getCurrentPosition( position => {
      pos = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };
      setHome( pos );
    },
    () => {
      console.log( "The browser doesn't allow GeoLocation." )
      setHome( pos );
    } );
  }
  else {
    console.log( "The browser doesn't support GeoLocation." )
    setHome( pos );
  }

  // Manage InfoWindow
  map.addListener( 'click', () => infoWindow.close() );

  // Load the database and start the processing of information
  // $.get(
  //   BEER_DATABASE_FILE,
  //   data => {
  //     beerDb = new BeerPlacesDB( jsyaml.safeLoad( data )[ 'Beer places' ] )
  //     beerDb.queryForLocations();
  //   },
  //   'text'
  // );
}

/**
 * Stores of all the Beer Places and some additional information
 */
function BeerPlacesDB( YAMLData ) {
  var places = new Array();
  var timer;

  // Scan all the YAML results and build objects
  for ( var country in YAMLData ) {
    var countryCities = YAMLData[ country ];
    for ( var city in countryCities ) {
      var cityPlaces = countryCities[ city ];
      for ( var place in cityPlaces ) {
        var beerPlace = cityPlaces[ place ];
        places.push( new BeerPlace( beerPlace, country, city ) );
      }
    }
  }

  // Properties with statistical data
  this.places = places.sort();
  this.averages = places.map( i => i.averageScore() );
  this.averageMax = this.averages.reduce( ( a, b ) => Math.max( a, b ) );
  this.averageMin = this.averages.reduce( ( a, b ) => Math.min( a, b ) );

  /**
   * Loads asynchronously the information about the location of all the places
   */
  this.queryForLocations = function() {
    function executeLocationQuery( callback ) {
      locationToLoad = locationToLoad.filter( place =>
        !place.hasValidLocationData
      );

      if ( locationToLoad.length != 0 ) {
        locationToLoad[ 0 ].queryLocation( ( place, status ) => {
          if ( status == google.maps.places.PlacesServiceStatus.OK ) {
            thisRef.addMarker( place );
          }
        } );
        setTimeout( executeLocationQuery, 300 );
      }
    };

    var thisRef = this;
    var locationToLoad = this.places;
    executeLocationQuery();
  }

  /**
   * Adds a Beer Place as a marker on the map
   */
  this.addMarker = function( place ) {
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
      position: place.geometry.location,
      infoWindow: infoWindow
    } );

    // Manage the click
    marker.addListener( 'click', () => {
      infoWindow.setContent( place.placeInfoWindow() );
      infoWindow.open( map, marker );
    } );
  }

  /**
   * Calculates the colour of the pin.
   */
  this.pinColour = function( place ) {
    function toColorHex( number ) {
      number = Math.max( Math.min( parseInt( number ), 255 ), 0 )
      let str = number.toString( 16 );
      return "0".repeat( 2 - str.length ) + str;
    }

    var range = 10.0 / ( this.averageMax - this.averageMin )
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

  this.hasValidLocationData = false;
  this.hasValidPlaceDetails = false;

  /**
   * The average score of the place
   */
  this.averageScore = function() {
    var average = 0.0,
      count = 0;

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
  this.queryLocation = function( callback ) {
    var request = {
      'query': `${this.Name}, ${this.Address}`
    };

    placesService.textSearch( request, ( results, status ) => {
      console.log( `Text search completed for ${this.Name} with status ${status}` );

      if ( status == google.maps.places.PlacesServiceStatus.OK ) {
        Object.assign( this, results[ 0 ] );
        this.hasValidLocationData = true;
        console.log( `Found ID for ${this.Name}: ${this.id}` );
      }
      else if ( status == google.maps.places.PlacesServiceStatus.ZERO_RESULTS ) {
        this.hasValidLocationData = true;
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
  this.queryDetails = function( callback ) {
    if ( !this.hasValidPlaceDetails ) {
      return;
    }

    var request = {
      'placeId': this.placeId
    };
    placesService.getDetails( request, ( results, status ) => {
      console.log( `Details search completed for ${this.Name} with status ${status}` );

      if ( status == google.maps.places.PlacesServiceStatus.OK ) {
        Object.assign( this, results[ 0 ] );
        this.hasValidPlaceDetails = true;
        console.log( `Found details for ${this.Name}: ${this.id}` );
      }
      else if ( status == google.maps.places.PlacesServiceStatus.ZERO_RESULTS ) {
        this.hasValidPlaceDetails = true;
      }

      if ( callback ) {
        callback( this, status );
      }
    } );
  }

  /**
   * Build the InfoWindow content for the place
   */
  this.placeInfoWindow = function() {
    var hndPlaceInfo = Handlebars.compile(
      $( '#place-template' )[ 0 ].innerHTML
    );

    return hndPlaceInfo( {
      name: `${this.Name} - ${this.averageScore().toFixed(2)}/10`,
      address: this.Address,
      type: this.Type,
      score: this.Score || "",
      expectation: this.Expectation || ""
    } );
  }
}

/* Adding the flatMap function to Arrays */
// const flatMap = ( f, xs ) =>
//   xs.reduce( ( acc, x ) =>
//     acc.concat( f( x ) ), [] );
// Array.prototype.flatMap = function( f ) {
//   return flatMap( f, this )
// };