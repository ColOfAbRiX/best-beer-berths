/*
MIT License

Copyright (c) 2018-2023 Fabrizio Colonna <colofabrix@tin.it>

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

const BEER_DATABASE_FILE = urlParam("BEER_DATABASE_FILE", "database.yml")

// Default position when no other position is available
const DEFAULT_POSITION = {lat: 51.5189138, lng: -0.0924759};
const POSITION_UPDATE = 10;

// Cache options
const CACHE_ENABLED = urlBoolParam("CACHE_ENABLED", true);
const CACHE_DURATION = urlNumParam("CACHE_DURATION", 2678400);

// Debug options
const DEBUG = urlBoolParam("DEBUG", false);
const DEBUG_LEVEL = urlNumParam("DEBUG_LEVEL", 2);
const DEBUG_ON_PAGE = urlBoolParam("DEBUG_ON_PAGE", false);
const DEBUG_CITY = new RegExp( urlParam("DEBUG_CITY", "(london)"), 'i' );
// const DEBUG_POSITION = {lat: 51.532492399999995, lng: -0.0351538};
// const DEBUG_POSITION = {lat: 51.5189138, lng: -0.0924759};
// const DEBUG_POSITION = {lat: 51.5034208, lng: -0.1109708}
const DEBUG_POSITION = {lat: 44.0372932, lng: 12.6069268};

// Pins colours
const PINS = {
  'tried': [ 'FFFFFF', 'FF7FFF' ],
  'to try': [ 'FFFFFF', '007FFF' ]
};


/**
 * Helper for debugging
 */
var Logger = (function() {
  var debug;
  var log_level = DEBUG_LEVEL;

  var _initDebug = function() {
    if( !debug && $('#debug').length === 0) {
      $('body').append('<div id="debug"></div>');
    }
    debug = $('#debug')[0];
    return debug;
  };

  var _canLog = function( requested ) {
    if( requested === "trace" && log_level >= 4 ) {
      return true;
    } else if( requested === "debug" && log_level >= 3 ) {
      return true;
    } else if( requested === "info" && log_level >= 2 ) {
      return true;
    } else if( requested === "warn" && log_level >= 1 ) {
      return true;
    } else if( requested === "error" && log_level >= 0 ) {
      return true;
    }
    return false;
  }

  var _write = function(value, type, ...optionalParams) {
    if( !_canLog(type) ) {
      return;
    }
    var time = $.format.date(new Date(), 'HH:mm:ss.SSS');
    if( DEBUG && isMobile() || DEBUG_ON_PAGE ) {
      if( _initDebug() ) {
        if( typeof(value) === "object" ) {
          console.log( value );
        } else {
          debug.innerHTML = `<span class="${type}">${time}: ${value}</span>` + debug.innerHTML;
        }
      }
    } else {
      if( type === "trace" || type === "debug") {
        console.log(value, ...optionalParams);
      } else if( type === "info" ) {
        console.info(value, ...optionalParams);
      } else if( type === "warn" ) {
        console.warn(value, ...optionalParams);
      } else if( type === "error" ) {
        console.error(value, ...optionalParams);
      }
    }
  };

  var setLogLevel = function( value ) {
    log_level = value;
  }

  var getLogLevel = function() {
    return log_level;
  }

  return {
    getLogLevel: getLogLevel,
    setLogLevel: setLogLevel,
    trace: function(text, ...optionalParams) { _write(text, "trace", ...optionalParams) },
    debug: function(text, ...optionalParams) { _write(text, "debug", ...optionalParams) },
    info: function(text, ...optionalParams) { _write(text, "info", ...optionalParams) },
    info: function(text, ...optionalParams) { _write(text, "info", ...optionalParams) },
    warn: function(text, ...optionalParams) { _write(text, "warn", ...optionalParams) },
    error: function(text, ...optionalParams) { _write(text, "error", ...optionalParams) }
  };
})();


/**
 * Executes an asynchronous action over objects of a queue
 */
function processQueueAsync( inputQueue, outputQueue, action, successValue, successAction, failAction, doneAction ) {
  function execute() {
    if( inputQueue.length > 0 ) {
      var item = inputQueue[ 0 ];

      // Determine the action to run
      var runAction = action( item );
      if( !runAction ) {
        Logger.debug( `processQueueAsync(): function didn't return any action to execute` );
        if( doneAction ) {
          doneAction();
        }
        return;
      }

      // Run the action
      runAction( (item, status) => {
        Logger.debug( `processQueueAsync(): delay=${delay.toFixed(3)}ms, dec=${delayDecay.toFixed(3)}ms` );

        if( status == null ) {
          Logger.debug( "processQueueAsync(): Received null status" );

          if( failAction ) {
            failAction( item, status );
          }
          // The delay between requests is self-adjustable
          setTimeout( execute, delay );
        }
        else if( status.match(successValue) ) {
          Logger.trace( `processQueueAsync(): Received SUCCESS status` );

          // Transfer the item from input to output queue
          var doneItem = inputQueue.shift();
          if( outputQueue != undefined ) {
            outputQueue.push( doneItem );
          }
          // Tune delay and call callback
          delay -= delayDecay;
          delayDecay *= ( 1.0 - 1 / steepness ) * 0.9;
          if( successAction ) {
            successAction( doneItem );
          }
          // The delay between requests is self-adjustable
          setTimeout( execute, delay );
        }
        else {
          Logger.debug( `processQueueAsync(): Received ${successValue} status` );

          // Tune delay and call callback
          delay *= 2.2;
          delayDecay = delay / steepness;
          if( failAction ) {
            failAction( item, status );
          }
          // The delay between requests is self-adjustable
          setTimeout( execute, delay );
        }
      });
    }
    else if( doneAction ) {
      // Call the done action
      Logger.trace( `processQueueAsync(): execution completed` );
      doneAction();
    }
  }

  // Set initial values and start
  Logger.debug( `processQueueAsync(): starting execution` );
  const steepness = 2.0;
  var delay = 400;
  var delayDecay = delay / ( steepness * 2.0 );
  execute();
}


/**
 * Gets a colour from a gradient.
 * See: https://stackoverflow.com/questions/3080421/javascript-colour-gradient
 */
function getGradientColour( start_colour, end_colour, percent ) {
  // Condition the percentage
  percent = Math.max(Math.min(percent, 1.0), 0.0);

  // Strip the leading # if it's there
  var start_colour = start_colour.replace( /^\s*#|\s*$/g, '' );
  var end_colour = end_colour.replace( /^\s*#|\s*$/g, '' );

  // Convert 3 char codes --> 6, e.g. `E0F` --> `EE00FF`
  if( start_colour.length === 3 ) {
    start_colour = start_colour.replace( /(.)/g, '$1$1' );
  }
  if( end_colour.length === 3 ) {
    end_colour = end_colour.replace( /(.)/g, '$1$1' );
  }

  // Convert colours from HEX
  var start_red = parseInt( start_colour.substr(0, 2), 16 );
  var start_green = parseInt( start_colour.substr(2, 2), 16 );
  var start_blue = parseInt( start_colour.substr(4, 2), 16 );

  var end_red = parseInt( end_colour.substr(0, 2), 16 );
  var end_green = parseInt( end_colour.substr(2, 2), 16 );
  var end_blue = parseInt( end_colour.substr(4, 2), 16 );

  // Calculate new colour
  var new_red = ((end_red - start_red) * percent) + start_red;
  var new_green = ((end_green - start_green) * percent) + start_green;
  var new_blue = ((end_blue - start_blue) * percent) + start_blue;

  // Convert back to HEX
  new_red = new_red.toString( 16 ).split( '.' )[0];
  new_green = new_green.toString( 16 ).split( '.' )[0];
  new_blue = new_blue.toString( 16 ).split( '.' )[0];

  // Ensure 2 digits by colour
  if( new_red.length === 1 ) new_red = '0' + new_red;
  if( new_green.length === 1 ) new_green = '0' + new_green;
  if( new_blue.length === 1 ) new_blue = '0' + new_blue;

  return `${new_red}${new_green}${new_blue}`;
}


/**
 * Converts a value into its relative position inside a range using linear
 * interpolation
 */
function rangeRelative( min, value, max ) {
  if (min == max)
    return min;

  // Make sure that min < max
  if( min > max ) {
    min = [max, max = min][0];
  }
  var value = Math.max( min, Math.min( max, value ) );
  return (value - min) / (max - min);
}


/**
 * Returns true if we are on a mobile device
 */
function isMobile() {
  try { document.createEvent("TouchEvent"); } catch(e) { return false; }
  return true;
}


/**
 * Create a Google Pin URL
 */
function buildPinUrl( text, fill_colour, scale_factor, font_size ) {
  return `http${isSSL() ? 's' : ''}://` +
    `chart.apis.google.com/chart?chst=d_map_pin_letter&` +
    `chld=%E2%80%A2|${fill_colour}`;
}


/**
 * Get a URL parameter
 * See https://stackoverflow.com/questions/19491336/get-url-parameter-jquery-or-how-to-get-query-string-values-in-js
 */
function urlParam( name, default_value = null ) {
  var searchParams = new URLSearchParams(window.location.search);
  if( !searchParams.has(name) ) {
    return default_value;
  }
  else {
    return searchParams.get(name);
  }
}


/**
 * Get a URL parameter as boolean
 */
function urlBoolParam( name, default_value = true ) {
  const param = urlParam(name, default_value);
  if (param === null) {
    return null;
  } else {
    return param.toString().toLowerCase() === "true";
  }
}


/**
 * Get a URL parameter as number
 */
function urlNumParam( name, default_value = 0 ) {
  return Number(urlParam(name, default_value));
}


/**
 * Checks if we're under SSL encryption
 */
function isSSL() {
  return document.location.protocol === "https:"
}


/**
 * Rescales a point from the input range mapping it into the output range
 */
function rescalePoint(point, inputMin, inputMax, outputMin = 0.0, outputMax = 10.0) {
  return (point - inputMin + outputMin) * outputMax / (inputMax - inputMin)
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
  });
}
