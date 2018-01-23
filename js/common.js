"use strict";

const BEER_DATABASE_FILE = "database.yml"

// Default position when no other position is available
const DEFAULT_POSITION = {
  lat: 51.5189138,
  lng: -0.0924759
};
const POSITION_UPDATE = 10;

// Cache options
const CACHE_ENABLED = true;
const CACHE_DURATION = 86400;

// Pins colours
const PINS = {
  'tried': [ 'FFFFFF', 'FF7FFF' ],
  'to try': [ 'FFFFFF', '007FFF' ]
};

// Debug options
const DEBUG = false;
const DEBUG_CITY = /(london)/i;
const DEBUG_POSITION = {
  lat: 51.5189138,
  lng: -0.0924759
};
// const DEBUG_POSITION = {lat: 44.0372932, lng: 12.6069268};
// const DEBUG_POSITION = {lat: 51.532492399999995, lng: -0.0351538};


// Global status
var beerDb;


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
  const S = 2.0; // Steepness
  var delay = 400;
  var dDec = delay / ( S * 2.0 );
  execute();
}


/**
 * Converts a value into its relative position inside a range using linear
 * interpolation
 */
function rangeRelative( minValue, value, maxValue ) {
  // Condition the value inside the range
  var boundValue = Math.max( minValue, Math.min( maxValue, value ) );
  // Calculate it percentage inside the range
  return ( boundValue - minValue ) / ( maxValue - minValue );
}


/**
 * Gets a colour from a gradient.
 * See: https://stackoverflow.com/questions/3080421/javascript-color-gradient
 */
function getGradientColor( start_color, end_color, percent ) {
  // Strip the leading # if it's there
  var start_color = start_color.replace( /^\s*#|\s*$/g, '' );
  var end_color = end_color.replace( /^\s*#|\s*$/g, '' );

  // Convert 3 char codes --> 6, e.g. `E0F` --> `EE00FF`
  if ( start_color.length === 3 ) {
    start_color = start_color.replace( /(.)/g, '$1$1' );
  }

  if ( end_color.length === 3 ) {
    end_color = end_color.replace( /(.)/g, '$1$1' );
  }

  // Get colours
  var start_red = parseInt( start_color.substr( 0, 2 ), 16 ),
    start_green = parseInt( start_color.substr( 2, 2 ), 16 ),
    start_blue = parseInt( start_color.substr( 4, 2 ), 16 );

  var end_red = parseInt( end_color.substr( 0, 2 ), 16 ),
    end_green = parseInt( end_color.substr( 2, 2 ), 16 ),
    end_blue = parseInt( end_color.substr( 4, 2 ), 16 );

  // Calculate new colour
  var diff_red = end_red - start_red;
  var diff_green = end_green - start_green;
  var diff_blue = end_blue - start_blue;

  diff_red = ( ( diff_red * percent ) + start_red ).toString( 16 ).split( '.' )[ 0 ];
  diff_green = ( ( diff_green * percent ) + start_green ).toString( 16 ).split( '.' )[ 0 ];
  diff_blue = ( ( diff_blue * percent ) + start_blue ).toString( 16 ).split( '.' )[ 0 ];

  // Ensure 2 digits by colour
  if ( diff_red.length === 1 ) diff_red = '0' + diff_red
  if ( diff_green.length === 1 ) diff_green = '0' + diff_green
  if ( diff_blue.length === 1 ) diff_blue = '0' + diff_blue

  return diff_red + diff_green + diff_blue;
}


/**
 * Function to draw score stars
 */
$.fn.stars = function () {
  return $( this ).each( function () {
    // Read values from HTML and interpret it as JSON
    var json = $.parseJSON( $( this ).html() );

    // Convert the value in pixel size (5 stars, each 16 pixels wide)
    var value = rangeRelative( json.minValue, json.value, json.maxValue );
    var quarterValue = Math.round( value * 4 ) / 4;
    var imageWidth = quarterValue * 5 * 16;

    // Add the stars
    $( this ).html(
      $( '<span />' ).width( imageWidth )
    );
  } );
}