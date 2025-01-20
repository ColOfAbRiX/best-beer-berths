/*
MIT License

Copyright (c) 2018-2025 Fabrizio Colonna <colofabrix@tin.it>

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
SOFTWARE*/

"use strict";

var GoogleMap = (function(){
  // Global objects
  var map;
  var heatmap;
  var homeMarker;
  var infoWindow;
  var placesService;
  var lastPosition;
  var centerHome = true;
  var markers = [];

  /**
   * Initializes Google Map.
   *
   * For marker icons, see:
   *   https://github.com/Concept211/Google-Maps-Marker
   *   https://kml4earth.appspot.com/icons.html
   */
  var init = async function() {
    // Create global objects
    map = await new google.maps.Map(
      $( '#map' )[0], {
        maxZoom: 18,
        minZoom: 2,
        zoom: 14,
        mapTypeId: google.maps.MapTypeId.ROADMAP,
        gestureHandling: 'greedy',
        mapId: "4504f8b37365c3d0",
      }
    );
    infoWindow = await new google.maps.InfoWindow({ maxWidth: 300 });
    placesService = await new google.maps.places.PlacesService( map );
    heatmap = await new google.maps.visualization.HeatmapLayer({
      radius: 100,
      opacity: 0.5,
      maxIntensity: 15,
    });

    // Set style if present
    if( typeof GOOGLE_MAP_STYLE !== 'undefined' ) {
      map.set( 'styles', GOOGLE_MAP_STYLE );
    }

    // Add controls to the map
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
    map.addListener( 'idle', () => _markersVisibility() )

    // Load the database and start the processing of information
    $.get(
      BEER_DATABASE_FILE,
      ( data ) => {
        PlacesDB.init( jsyaml.load( data )['Beer places'] );
      },
      'text'
    );
  };

  /**
   * Updates the current position on the map
   */
  var _updatePosition = async function() {
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
  var _setHome = async function( homePosition, center = true, init = false ) {
    const { AdvancedMarkerElement } = await google.maps.importLibrary("marker");
    lastPosition = homePosition;
    if( typeof(homeMarker) == 'undefined' || init ) {
      homeMarker = new AdvancedMarkerElement( {
        map: map,
        position: homePosition,
        title: 'test'
      } );
    }
    else {
      homeMarker.position = homePosition;
    }

    if( init || center ) {
      map.setCenter( homePosition );
    }
  };

  /**
   * Adds the button to centre the map
   */
  var _addCentreButton = async function() {
    $('body').append('<div id="center-btn" class="map-ctrl-box" role="button"><div id="ctrl-center-text">Centre map</div></div>');

    var btn = $( '#center-btn' )[0];

    btn.addEventListener('click', () => {
      centerHome = true;
      _setHome( lastPosition, centerHome );
    });

    map.controls[google.maps.ControlPosition.TOP_CENTER].push( btn );
  };

  /**
   * Manage the visibility of all the markers in the viewport
   */
  var _markersVisibility = async function() {
    var bounds = map.getBounds();
    markers.forEach( marker =>
      _displayMarker(marker, bounds)
    );
  };

  /**
   * Display a marker if it's in the visible region of the map
   */
  var _displayMarker = async function( marker, bounds ) {
    if( bounds == undefined ) {
      return;
    }
    if( bounds.contains(marker.position) ) {
      if( marker.map != map ) {
        marker.map = map;
      }
    }
    else {
      marker.map = null;
    }
  }

  /**
   * Displays a heatmap with the places on the map
   */
  var toggleHeatmap = async function( points = [], display = null ) {
    var heatmapShowing = heatmap && heatmap.map == map

    if( heatmapShowing && display == null || display == false ) {
      Logger.info( "Hiding heatmap" );
      heatmap.map = null;
    }
    if( !heatmapShowing && display == null || display == true ) {
      Logger.info( "Displaying heatmap" );
      Logger.trace( points );
      heatmap.setData( points );
      heatmap.map = map;
    }
  };

  /**
   * Adds a Beer Place as a marker on the map
   */
  var addMarker = async function( place, min_avg_score, max_avg_score ) {
    // Percentage of the colour based on the relative position of the score
    var value_percent = rangeRelative( min_avg_score, place.avg_score, max_avg_score );

    // Calculate the colour
    var marker_colour = getGradientColour(
      PINS[place.raw_data.Status.toLowerCase()][0],
      PINS[place.raw_data.Status.toLowerCase()][1],
      value_percent
    );

    const { AdvancedMarkerElement, PinElement }= await google.maps.importLibrary("marker");

    if (place.raw_data.Status.toLowerCase() == "tried") {
      var borderColor =  "#CC0000";
    }
    else {
      var borderColor =  "#0000CC";
    }

    var pin = new PinElement({
      glyphColor: "white",
      background: "#" + marker_colour,
      borderColor: borderColor
    });

    if (typeof place.google_location == "undefined") {
      console.warn(`Beer place '${place.raw_data.Name} - ${place.raw_data.Address}' was not found by google`);
      return;
    };

    var marker = new AdvancedMarkerElement({
      map: map,
      title: `${place.raw_data.Name} - ${place.avg_score.toFixed(2)}/10`,
      position: place.google_location.geometry.location,
      content: pin.element,
    });

    // Add marker to the local list
    markers.push( marker );
    _displayMarker( marker, map.getBounds() );

    // Manage the click
    marker.addListener('click', () => {
      infoWindow.setContent( place.htmlDetails() );
      infoWindow.open( map, marker );

      // Build the stars
      $( function() {
        $( 'span.stars' ).stars();
      } );

      // Update the place info
      place.queryDetails( (place, status) => {
        console.log("Updating content status", status);
        console.log("Updating content", place.htmlDetails());
        infoWindow.setContent( place.htmlDetails() );
      }, true );

      Logger.info( place );
    });
  };

  return {
    'placesService': function() { return placesService; },
    'init': init,
    'addMarker': addMarker,
    'toggleHeatmap': toggleHeatmap,
  };
})();
