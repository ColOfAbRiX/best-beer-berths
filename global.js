"use strict";


const BEER_DATABASE_FILE = "database.yml"
const DEBUG = false;
const DEBUG_CITY = /(riccione|rimini)/i;
// Rimini
const DEBUG_POSITION = {
  lat: 44.0372932,
  lng: 12.6069268
};
// London
// const DEBUG_POSITION = {
//   lat: 51.5189138,
//   lng: -0.0924759
// };


var beerDb;
var map, infoWindow, placesService;


/**
 * Initializes Google Map
 */
function initGoogle() {
  /**
   * Sets the home position on the Map
   */
  var setHome = function ( homePos ) {
    console.info( `Home location: ${JSON.stringify(homePos)}` );

    // Add centre marker
    var homeMarker = new google.maps.Marker( {
      icon: {
        path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
        scale: 5
      },
      clickable: false,
      map: map,
      position: pos
    } );
    map.setCenter( pos );
  }

  // Create global objects
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

  // Centre the map on the current position
  var pos = {
    lat: 51.5189138,
    lng: -0.0924759
  };
  if ( DEBUG ) {
    pos = DEBUG_POSITION;
  }
  if ( navigator.geolocation && !DEBUG ) {
    navigator.geolocation.getCurrentPosition( position => {
        pos = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        setHome( pos );
      },
      error => {
        console.warn( `Can't get the position: ${error.message}` );
        setHome( pos );
      } );
  }
  else if ( !DEBUG ) {
    console.info( "The browser doesn't support GeoLocation." )
    setHome( pos );
  }
  else {
    console.info( "Using debug position." )
    setHome( pos );
  }

  // Manage InfoWindow
  map.addListener( 'click', () => infoWindow.close() );

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
 * Executes an asynchronous action over objects of a queue
 */
function executeAsync( inputQueue, outputQueue, action, successValue, successAction, failAction, doneAction ) {
  function execute() {
    if ( inputQueue.length > 0 ) {
      var item = inputQueue[ 0 ];

      // Determine the action to run
      var runAction = action( item );
      if ( !runAction ) {
        doneAction();
        return;
      }

      // Run the action
      runAction( ( item, status ) => {
        console.info( `Delay info: delay=${delay.toFixed(3)}ms, inc=${dInc.toFixed(3)}ms, dec=${dDec.toFixed(3)}ms` );

        if ( status == successValue ) {
          // Transfer the item from input to output queue
          var doneItem = inputQueue.shift();
          if ( outputQueue != undefined ) {
            outputQueue.push( doneItem );
          }
          // Tune delay and call callback
          delay -= dDec;
          dDec *= 0.5;
          if ( successAction ) {
            successAction( doneItem );
          }
        }
        else {
          // Tune delay and call callback
          delay += dInc;
          dInc = delay / 2.0;
          dDec = dInc / 2.0;
          if ( failAction ) {
            failAction( item, status );
          }
        }
        // The delay between requests is self-adjustable
        setTimeout( execute, delay );
      } );
    }
    else if ( doneAction ) {
      // Call the done action
      doneAction();
    }
  }

  // Set initial values and start
  var delay = 500;
  var dInc = delay / 2.0;
  var dDec = dInc / 2.0;
  execute();
}


/**
 * Function to draw score stars
 */
$.fn.stars = function () {
  return $( this ).each( function () {
    // Get the value and divide by 2 because we use only 5 stars
    var val = parseFloat( $( this ).html() ) / 2.0;
    // Make sure that the value is in 0 - 5 range, multiply to get width
    var size = Math.max( 0, ( Math.min( 5, val ) ) ) * 16;
    // Add the stars
    $( this ).html(
      $( '<span />' ).width( size )
    );
  } );
}