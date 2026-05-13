/*
MIT License

Copyright (c) 2017-2026 Fabrizio Colonna <colofabrix@tin.it>

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

// Status constants to replace Google's PlacesServiceStatus
var PlacesServiceStatus = {
  OK: "OK",
  ZERO_RESULTS: "ZERO_RESULTS",
  OVER_QUERY_LIMIT: "OVER_QUERY_LIMIT",
  ERROR: "ERROR"
};

var LeafletMap = (function(){
  // Global objects
  var map;
  var homeMarker;
  var lastPosition;
  var centerHome = true;
  var markers = [];

  /**
   * Initializes Leaflet Map.
   */
  var init = async function() {
    Logger.info( "Initializing Leaflet Map..." );

    // Create map
    map = L.map('map', {
      maxZoom: 18,
      minZoom: 2,
      zoom: 14
    });

    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

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
    map.on( 'click', () => {
      // Close any open popups
      map.closePopup();
    });
    map.on( 'drag', () => centerHome = false );
    map.on( 'moveend', () => _markersVisibility() );

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
    lastPosition = homePosition;

    // Create home marker icon
    var homeIcon = L.divIcon({
      className: 'home-marker',
      html: '<div style="background-color: #4285F4; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3);"></div>',
      iconSize: [22, 22],
      iconAnchor: [11, 11]
    });

    if( typeof(homeMarker) == 'undefined' || init ) {
      homeMarker = L.marker([homePosition.lat, homePosition.lng], {
        icon: homeIcon,
        title: 'Your location'
      }).addTo(map);
    }
    else {
      homeMarker.setLatLng([homePosition.lat, homePosition.lng]);
    }

    if( init || center ) {
      map.setView([homePosition.lat, homePosition.lng], map.getZoom() || 14);
    }
  };

  /**
   * Adds the button to centre the map
   */
  var _addCentreButton = async function() {
    // Create a custom control
    var CentreControl = L.Control.extend({
      options: { position: 'topright' },
      onAdd: function(map) {
        var container = L.DomUtil.create('div', 'leaflet-bar leaflet-control map-ctrl-box');
        container.innerHTML = '<a href="#" id="center-btn" role="button" style="padding: 5px 10px; display: block; text-decoration: none; color: #333;">Centre map</a>';
        container.onclick = function(e) {
          e.preventDefault();
          centerHome = true;
          _setHome( lastPosition, centerHome );
        };
        return container;
      }
    });
    map.addControl(new CentreControl());
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
    if( bounds.contains(marker.getLatLng()) ) {
      if( !map.hasLayer(marker) ) {
        marker.addTo(map);
      }
    }
    else {
      if( map.hasLayer(marker) ) {
        map.removeLayer(marker);
      }
    }
  }

  /**
   * Displays a heatmap with the places on the map (stub - heatmap removed)
   */
  var toggleHeatmap = async function( points = [], display = null ) {
    Logger.info( "Heatmap feature not available in Leaflet version" );
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

    if (place.raw_data.Status.toLowerCase() == "tried") {
      var borderColor = "#CC0000";
    }
    else {
      var borderColor = "#0000CC";
    }

    if (typeof place.osm_location == "undefined" || place.osm_location == null) {
      console.warn(`Beer place '${place.raw_data.Name} - ${place.raw_data.Address}' was not found by geocoder`);
      return;
    };

    // Create custom marker icon using the same color scheme
    var markerIcon = L.divIcon({
      className: 'beer-marker',
      html: `<div style="
        background-color: #${marker_colour};
        width: 24px;
        height: 24px;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        border: 2px solid ${borderColor};
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      "></div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 24],
      popupAnchor: [0, -24]
    });

    var marker = L.marker([place.osm_location.lat, place.osm_location.lon], {
      icon: markerIcon,
      title: `${place.raw_data.Name} - ${place.avg_score.toFixed(2)}/10`
    });

    // Bind popup with place details
    marker.bindPopup(place.htmlDetails(), { maxWidth: 450 });

    // Handle click to update details
    marker.on('click', () => {
      // Update the place info on click
      place.queryDetails( (place, status) => {
        marker.setPopupContent( place.htmlDetails() );
        $( function() { $( 'span.stars' ).stars(); } );
      }, true );

      // Build the stars
      $( function() {
        $( 'span.stars' ).stars();
      } );

      Logger.info( place );
    });

    // Add marker to the local list
    markers.push( marker );
    _displayMarker( marker, map.getBounds() );
  };

  return {
    'init': init,
    'addMarker': addMarker,
    'toggleHeatmap': toggleHeatmap,
  };
})();

// Alias for backwards compatibility
var GoogleMap = LeafletMap;

// Initialize when DOM is ready (replaces the Google Maps callback)
$(document).ready(function() {
  LeafletMap.init();
});
