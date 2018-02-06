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
        zoom: 13,
        mapTypeId: google.maps.MapTypeId.ROADMAP,
        gestureHandling: 'greedy'
      }
    );
    infoWindow = new google.maps.InfoWindow({
      maxWidth: 300
    });
    placesService = new google.maps.places.PlacesService( map );

    // Set style if present
    if( typeof GOOGLE_MAP_STYLE !== 'undefined' ) {
      map.set( 'styles', GOOGLE_MAP_STYLE );
    }

    // Add controls to the map
    if( !isMobile() ) { addLegend(); }
    addCentreButton();

    // Centre the map on the current position
    if( !DEBUG && navigator.geolocation ) {
      Logger.info( "Locating user..." )
      setHome( DEFAULT_POSITION, true, true );
      updatePosition();
    }
    else {
      if( !DEBUG ) {
        Logger.info( "The browser doesn't support GeoLocation." )
        setHome( DEFAULT_POSITION );
      }
      else {
        Logger.info( "Using debug position." )
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
        PlacesDB.init( jsyaml.safeLoad( data )['Beer places'] );
      },
      'text'
    );
  };


  /**
   * Updated the current position on the map
   */
  var updatePosition = function() {
    navigator.geolocation.getCurrentPosition(
      position => {
        var position = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        Logger.info( `Current location: ${JSON.stringify(position)}` );
        setHome( position, centerHome );
        setTimeout( updatePosition, POSITION_UPDATE * 1000 );
      },
      error => {
        Logger.warn( `Can't get the position: ${error.message}` );
        setHome( lastPosition, centerHome );
      }
    );
  };


  /**
   * Set the home position on the Map and optionally centre on it
   */
  var setHome = function( homePosition, center = true, init = false ) {
    lastPosition = homePosition;

    if ( typeof(homeMarker) == 'undefined' || init ) {
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

    if ( init || center ) {
      map.setCenter( homePosition );
    }
  };


  /**
   * Adds the legend to the map and configures it
   */
  var addLegend = function() {
    var colouredPinUrl = function( colour ) {
      return (isSSL() ? "https" : "http") +
        "://chart.apis.google.com/chart?chst=d_map_pin_letter&chld=%E2%80%A2|" +
        colour;
    }

    // Create a range of URLs to the coloured pins to display in the legend
    var pins = ['tried', 'to try'].map( cat =>
      [0.0, 0.5, 1.0].map( x =>
        colouredPinUrl( getGradientColor(PINS[cat][0], PINS[cat][1], x) )
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
  var addCentreButton = function() {
    $('body').append('<div id="center-btn" class="map-ctrl-box" role="button"><div id="ctrl-center-text">Centre map</div></div>');

    var btn = $( '#center-btn' )[0];

    btn.addEventListener('click', () => {
      centerHome = true;
      setHome( lastPosition, centerHome );
    });

    map.controls[google.maps.ControlPosition.TOP_CENTER].push( btn );
  };


  /**
   * Adds a Beer Place as a marker on the map
   */
  var addMarker = function( place, min_avg_score, max_avg_score ) {
    // Percentage of the colour based on the relative position of the score
    var value_percent = rangeRelative( min_avg_score, place.avgScore, max_avg_score );

    // Calculate the colour
    var marker_colour = getGradientColor(
      PINS[place.Status.toLowerCase()][0],
      PINS[place.Status.toLowerCase()][1],
      value_percent
    );

    // Using Google Chart to have a custom colour pin
    var icon = (isSSL() ? "https" : "http") +
      "://chart.apis.google.com/chart?chst=d_map_pin_letter&chld=%E2%80%A2|" +
      encodeURI(marker_colour);
    // Build the pin
    var pinImage = new google.maps.MarkerImage(
      icon,
      new google.maps.Size( 21, 34 ),
      new google.maps.Point( 0, 0 ),
      new google.maps.Point( 10, 34 )
    );

    // Create and add the marker
    var title = `${place.Name} - ${place.avgScore.toFixed(2)}/10`;
    var marker = new google.maps.Marker({
      map: map,
      title: title,
      icon: pinImage,
      position: place.google_location.geometry.location,
      infoWindow: infoWindow
    });

    // Manage the click
    marker.addListener('click', () => {
      infoWindow.setContent( place.placeInfoWindow() );
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
