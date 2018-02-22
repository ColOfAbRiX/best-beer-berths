/*
MIT License

Copyright (c) 2018 Fabrizio Colonna <colofabrix@tin.it>

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

var GoogleMap = (function(){
  // Global objects
  var map;
  var homeMarker;
  var infoWindow;
  var placesService;
  var lastPosition;
  var centerHome = true;

  /**
   * Initializes Google Map.
   *
   * For marker icons, see:
   *   https://github.com/Concept211/Google-Maps-Marker
   *   https://kml4earth.appspot.com/icons.html
   */
  var init = function() {
    // Create global objects
    map = new google.maps.Map(
      $( '#map' )[0], {
        maxZoom: 18,
        minZoom: 2,
        zoom: 14,
        mapTypeId: google.maps.MapTypeId.ROADMAP,
        gestureHandling: 'greedy'
      }
    );
    infoWindow = new google.maps.InfoWindow({ maxWidth: 300 });
    placesService = new google.maps.places.PlacesService( map );

    // Set style if present
    if( typeof GOOGLE_MAP_STYLE !== 'undefined' ) {
      map.set( 'styles', GOOGLE_MAP_STYLE );
    }

    // Add controls to the map
    if( !isMobile() ) { _addLegend(); }
    _addCentreButton();

    // Centre the map on the current position
    if( !DEBUG && navigator.geolocation ) {
      Logger.info( "Locating user..." )
      _setHome( DEFAULT_POSITION, true, true );
      _updatePosition();
    }
    else {
      if( !DEBUG ) {
        Logger.info( "The browser doesn't support GeoLocation." )
        _setHome( DEFAULT_POSITION );
      }
      else {
        Logger.info( "Using debug position." )
        _setHome( DEBUG_POSITION );
      }
    }

    // Event management
    map.addListener( 'click', () => infoWindow.close() );
    map.addListener( 'drag', () => centerHome = false );

    // Load the database and start the processing of information
    $.get(
      BEER_DATABASE_FILE,
      ( data ) => {
        PlacesDB.init( jsyaml.safeLoad( data )['Beer places'] );
      },
      'text'
    );
  };

  /**
   * Updates the current position on the map
   */
  var _updatePosition = function() {
    navigator.geolocation.getCurrentPosition(
      ( position ) => {
        var position = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        Logger.debug( `Current location: ${JSON.stringify(position)}` );
        _setHome( position, centerHome );
        setTimeout( _updatePosition, POSITION_UPDATE * 1000 );
      },
      ( error ) => {
        Logger.warn( `Can't get the position: ${error.message}` );
        _setHome( lastPosition, centerHome );
      }
    );
  };

  /**
   * Set the home position on the Map and optionally centre on it
   */
  var _setHome = function( homePosition, center = true, init = false ) {
    lastPosition = homePosition;

    if( typeof(homeMarker) == 'undefined' || init ) {
      homeMarker = new google.maps.Marker( {
        icon: 'img/marker_red.png',
        clickable: false,
        map: map,
        position: homePosition
      } );
    }
    else {
      homeMarker.setPosition( homePosition );
    }

    if( init || center ) {
      map.setCenter( homePosition );
    }
  };

  /**
   * Adds the legend to the map and configures it
   */
  var _addLegend = function() {
    // Create a range of URLs to the coloured pins to display in the legend
    var pins = ['tried', 'to try'].map( cat =>
      [0.0, 0.5, 1.0].map( x =>
        buildPinUrl("%E2%80%A2", getGradientColour(PINS[cat][0], PINS[cat][1], x), 0.7, 8)
      ).map( url =>
        $( '<img />' ).attr( "src", url ).prop( 'outerHTML' )
      )
    );

    // Add the pin array to the legend
    [{i: 0, name: '#legend-tried'}, {i: 1, name: '#legend-totry'}].map( x => {
        $( x.name ).prepend( pins[x.i].join( '&hellip;' ) )
      }
    );

    // Add legend to the map
    map.controls[google.maps.ControlPosition.TOP_RIGHT].push(
      $( '#legend' )[0]
    );

    // Show the legend last
    $( '#legend' ).show();
  };

  /**
   * Adds the button to centre the map
   */
  var _addCentreButton = function() {
    $('body').append('<div id="center-btn" class="map-ctrl-box" role="button"><div id="ctrl-center-text">Centre map</div></div>');

    var btn = $( '#center-btn' )[0];

    btn.addEventListener('click', () => {
      centerHome = true;
      _setHome( lastPosition, centerHome );
    });

    map.controls[google.maps.ControlPosition.TOP_CENTER].push( btn );
  };

  /**
   * Adds a Beer Place as a marker on the map
   */
  var addMarker = function( place, min_avg_score, max_avg_score ) {
    // Percentage of the colour based on the relative position of the score
    var value_percent = rangeRelative( min_avg_score, place.avg_score, max_avg_score );

    // Calculate the colour
    var marker_colour = getGradientColour(
      PINS[place.raw_data.Status.toLowerCase()][0],
      PINS[place.raw_data.Status.toLowerCase()][1],
      value_percent
    );

    // Build the pin
    var pin_image = new google.maps.MarkerImage(
      buildPinUrl(place.avg_score.toFixed(2), marker_colour, 1.0, 9),
      new google.maps.Size( 21, 34 ),
      new google.maps.Point( 0, 0 ),
      new google.maps.Point( 10, 34 )
    );

    // Create and add the marker
    var marker = new google.maps.Marker({
      map: map,
      title: `${place.raw_data.Name} - ${place.avg_score.toFixed(2)}/10`,
      icon: pin_image,
      position: place.google_location.geometry.location,
      infoWindow: infoWindow
    });

    // Manage the click
    marker.addListener('click', () => {
      infoWindow.setContent( place.htmlDetails() );
      infoWindow.open( map, marker );

      // Build the stars
      $( function() {
        $( 'span.stars' ).stars();
      } );
      Logger.info( place );
    });
  };

  return {
    'placesService': function() { return placesService; },
    'init': init,
    'addMarker': addMarker,
  };
})();
