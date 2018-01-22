"use strict";

// Global objects
var map, homeMarker, infoWindow, placesService;
var centerHome = true, lastPosition;


/**
 * Initializes Google Map.
 *
 * For marker icons, see:
 *   https://github.com/Concept211/Google-Maps-Marker
 *   https://kml4earth.appspot.com/icons.html
 */
function initGoogle() {
  // Create global objects
  map = new google.maps.Map(
    $( '#map' )[ 0 ], {
      maxZoom: 18,
      minZoom: 2,
      zoom: 13,
      mapTypeId: google.maps.MapTypeId.ROADMAP,
      gestureHandling: 'greedy'
    }
  );
  infoWindow = new google.maps.InfoWindow;
  placesService = new google.maps.places.PlacesService( map );

  // Set style if present
  if ( typeof GOOGLE_MAP_STYLE !== 'undefined' ) {
    map.set( 'styles', GOOGLE_MAP_STYLE );
  }

  // Add the legend
  addLegend();

  // Centre the map on the current position
  if ( !DEBUG && navigator.geolocation ) {
    console.info( "Locating user..." )
    setHome( DEFAULT_POSITION, true, true );
    updatePosition();
  }
  else {
    if ( !DEBUG ) {
      console.info( "The browser doesn't support GeoLocation." )
      setHome( DEFAULT_POSITION );
    }
    else {
      console.info( "Using debug position." )
      setHome( DEBUG_POSITION );
    }
  }

  // Event management
  map.addListener( 'click', () => infoWindow.close() );
  map.addListener( 'drag', () => centerHome = false );

  // Load the database and start the processing of information
  $.get(
    BEER_DATABASE_FILE,
    data => {
      beerDb = new BeerPlacesDB( jsyaml.safeLoad( data )[ 'Beer places' ] )
      beerDb.fillDB();
    },
    'text'
  );
}


/**
 * Updated the current position on the map
 */
function updatePosition() {
  navigator.geolocation.getCurrentPosition( position => {
      var position = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };
      console.info( `Current location: ${JSON.stringify(position)}` );
      setHome( position, centerHome );
      setTimeout( updatePosition, 30000 );
    },
    error => {
      console.warn( `Can't get the position: ${error.message}` );
      setHome( lastPosition, centerHome );
    } );
}


/**
 * Sets the home position on the Map
 */
function setHome( homePosition, center = true, init = false ) {
  lastPosition = homePosition;

  if ( init ) {
    // Add home marker
    homeMarker = new google.maps.Marker( {
      icon: 'img/marker_red.png',
      clickable: false,
      map: map,
      position: homePosition
    } );
  }
  else {
    // Update the marker position
    homeMarker.setPosition( homePosition );
  }

  // Centre the map. Can be be requested at every update
  if ( init || center ) {
    map.setCenter( homePosition );
  }
}


/**
 * Adds the legend to the map and configures it
 */
function addLegend() {
  function colouredPinUrl( colour ) {
    return `https://chart.apis.google.com/chart?chst=d_map_pin_letter&chld=%E2%80%A2|${colour}`
  }

  function imagesRange( type ) {
    return [0.0, 0.5, 1.0].map(x =>
      colouredPinUrl( getGradientColor(
        PINS[ type ][ 0 ],
        PINS[ type ][ 1 ],
        x
      ) )
    );
  }

  // Add legend to the map
  map.controls[ google.maps.ControlPosition.TOP_RIGHT ].push(
    $( '#legend' )[ 0 ]
  );

  // Build coloured pin images
  var urls1 = imagesRange( 'tried' );
  var img11 = $( '<img />' ).attr( "src", urls1[ 0 ] ).prop( 'outerHTML' );
  var img12 = $( '<img />' ).attr( "src", urls1[ 1 ] ).prop( 'outerHTML' );
  var img13 = $( '<img />' ).attr( "src", urls1[ 2 ] ).prop( 'outerHTML' );
  var urls2 = imagesRange( 'to try' );
  var img21 = $( '<img />' ).attr( "src", urls2[ 0 ] ).prop( 'outerHTML' );
  var img22 = $( '<img />' ).attr( "src", urls2[ 1 ] ).prop( 'outerHTML' );
  var img23 = $( '<img />' ).attr( "src", urls2[ 2 ] ).prop( 'outerHTML' );

  // Add images
  $( '#legend-tried' ).prepend(
    img11 + "&hellip;" + img12 + "&hellip;" + img13
  );
  $( '#legend-totry' ).prepend(
    img21 + "&hellip;" + img22 + "&hellip;" + img23
  );

  $( '#legend' ).show();
}
