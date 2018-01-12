"use strict";


const BEER_DATABASE_FILE = "database.yml"

// Cache options
const CACHE_ENABLED = true;
const CACHE_DURATION = 86400;

// Pins colours
const PINS = {
  //'tried': ['FFFFFF', '33DD33'],
  'tried': ['FFFFFF', 'FF7FFF'],
  'to try': ['FFFFFF', '007FFF']
};

// Debug options
const DEBUG = false;
const DEBUG_CITY = /(london)/i;
// Rimini
// const DEBUG_POSITION = {
//   lat: 44.0372932,
//   lng: 12.6069268
// };
// London #1
const DEBUG_POSITION = {
  lat: 51.5189138,
  lng: -0.0924759
};
// London #2
// const DEBUG_POSITION = {
//   lat: 51.532492399999995,
//   lng: -0.0351538
// };


var beerDb;
var map, infoWindow, placesService;


/**
 * Initializes Google Map.
 *
 * For marker icons, see:
 *   https://github.com/Concept211/Google-Maps-Marker
 *   https://kml4earth.appspot.com/icons.html
 */
function initGoogle() {
  /**
   * Sets the home position on the Map
   */
  var setHome = function ( homePos ) {
    console.info( `Home location: ${JSON.stringify(homePos)}` );

    // // Add centre marker
    var homeMarker = new google.maps.Marker( {
      icon: 'img/marker_red.png',
      clickable: false,
      map: map,
      position: pos
    } );

    // Centre the map
    map.setCenter( pos );

    // Display the legend
    $( '#legend' ).show();
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

  // Set style if present
  if( typeof GOOGLE_MAP_STYLE !== 'undefined' ) {
    map.set( 'styles', GOOGLE_MAP_STYLE );
  }

  // Add the legend
  addLegend();

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
 * Adds the legend to the map and configures it
 */
function addLegend() {
  function colouredPinUrl( colour ) {
    return `https://chart.apis.google.com/chart?chst=d_map_pin_letter&chld=%E2%80%A2|${colour}`
  }
  function imagesRange( type ) {
    return [
      colouredPinUrl(PINS[type][0]),
      colouredPinUrl(getGradientColor(PINS[type][0], PINS[type][1], 0.5)),
      colouredPinUrl(PINS[type][1])
    ];
  }

  // Add legend to the map
  map.controls[ google.maps.ControlPosition.TOP_RIGHT ].push(
    $( '#legend' )[ 0 ]
  );

  // Build coloured pin images
  var urls1 = imagesRange( 'tried' );
  var img11 = $( '<img />' ).attr( "src", urls1[0] ).prop('outerHTML');
  var img12 = $( '<img />' ).attr( "src", urls1[1] ).prop('outerHTML');
  var img13 = $( '<img />' ).attr( "src", urls1[2] ).prop('outerHTML');
  var urls2 = imagesRange( 'to try' );
  var img21 = $( '<img />' ).attr( "src", urls2[0] ).prop('outerHTML');
  var img22 = $( '<img />' ).attr( "src", urls2[1] ).prop('outerHTML');
  var img23 = $( '<img />' ).attr( "src", urls2[2] ).prop('outerHTML');

  // Add images
  $( '#legend-tried' ).prepend(
    img11 + "&hellip;" + img12 + "&hellip;" + img13
  );
  $( '#legend-totry' ).prepend(
    img21 + "&hellip;" + img22 + "&hellip;" + img23
  );
}

/**
 * Executes an asynchronous action over objects of a queue
 */
function processQueueAsync( inputQueue, outputQueue, action, successValue, successAction, failAction, doneAction ) {
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
        console.info( `Delay info: delay=${delay.toFixed(3)}ms, dec=${dDec.toFixed(3)}ms` );

        if ( status.match( successValue ) ) {
          // Transfer the item from input to output queue
          var doneItem = inputQueue.shift();
          if ( outputQueue != undefined ) {
            outputQueue.push( doneItem );
          }
          // Tune delay and call callback
          delay -= dDec;
          dDec *= ( 1.0 - 1 / S ) * 0.9;
          if ( successAction ) {
            successAction( doneItem );
          }
          // The delay between requests is self-adjustable
          setTimeout( execute, delay );
        }
        else {
          // Tune delay and call callback
          dDec = delay / S;
          delay *= 2.2;
          if ( failAction ) {
            failAction( item, status );
          }
          // The delay between requests is self-adjustable
          setTimeout( execute, delay );
        }
      } );
    }
    else if ( doneAction ) {
      // Call the done action
      doneAction();
    }
  }

  // Set initial values and start
  const S = 3.0; // Steepness
  var delay = 500;
  var dDec = delay / ( S * 2.0 );
  execute();
}


/**
 * Converts a value into its relative position inside a range
 */
function rangeRelative(minValue, value, maxValue) {
  // Condition the value inside the range
  var boundValue = Math.max( minValue, Math.min( maxValue, value ) );
  // Calculate it percentage inside the range
  var percentValue = ( boundValue - minValue ) / ( maxValue - minValue );

  return parseFloat(percentValue);
}


/**
 * Gets a colour from a gradient.
 * See: https://stackoverflow.com/questions/3080421/javascript-color-gradient
 */
function getGradientColor(start_color, end_color, percent) {
   // Strip the leading # if it's there
   var start_color = start_color.replace(/^\s*#|\s*$/g, '');
   var end_color = end_color.replace(/^\s*#|\s*$/g, '');

   // Convert 3 char codes --> 6, e.g. `E0F` --> `EE00FF`
   if(start_color.length === 3){
     start_color = start_color.replace(/(.)/g, '$1$1');
   }

   if(end_color.length === 3){
     end_color = end_color.replace(/(.)/g, '$1$1');
   }

   // Get colours
   var start_red = parseInt(start_color.substr(0, 2), 16),
       start_green = parseInt(start_color.substr(2, 2), 16),
       start_blue = parseInt(start_color.substr(4, 2), 16);

   var end_red = parseInt(end_color.substr(0, 2), 16),
       end_green = parseInt(end_color.substr(2, 2), 16),
       end_blue = parseInt(end_color.substr(4, 2), 16);

   // Calculate new colour
   var diff_red = end_red - start_red;
   var diff_green = end_green - start_green;
   var diff_blue = end_blue - start_blue;

   diff_red = ( (diff_red * percent) + start_red ).toString(16).split('.')[0];
   diff_green = ( (diff_green * percent) + start_green ).toString(16).split('.')[0];
   diff_blue = ( (diff_blue * percent) + start_blue ).toString(16).split('.')[0];

   // Ensure 2 digits by colour
   if( diff_red.length === 1 ) diff_red = '0' + diff_red
   if( diff_green.length === 1 ) diff_green = '0' + diff_green
   if( diff_blue.length === 1 ) diff_blue = '0' + diff_blue

   return diff_red + diff_green + diff_blue;
 }


/**
 * Function to draw score stars
 */
$.fn.stars = function () {
  return $( this ).each( function () {
    // Read values from HTML and interpret it as JSON
    var json = $.parseJSON($( this ).html());

    // Convert the value in pixel size (5 stars, each 16 pixels wide)
    var value = rangeRelative(json.minValue, json.value, json.maxValue);
    var quarterValue = Math.round(value * 4) / 4;
    var imageWidth = quarterValue * 5 * 16;

    // Add the stars
    $( this ).html(
      $( '<span />' ).width( imageWidth )
    );
  } );
}
