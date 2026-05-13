#!/usr/bin/env python3

import os.path
from flask import Flask, Response, send_from_directory, request
import requests

app = Flask(__name__)
app.config.from_object(__name__)

# Enable CORS for all routes
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

@app.route('/')
def serve_index():
    return send_from_directory('.', 'map.html')

@app.route('/<path:path>')
def serve_files(path):
    return send_from_directory('.', path)

# Proxy endpoint for Nominatim to avoid CORS issues
@app.route('/proxy/nominatim')
def proxy_nominatim():
    # Get the query parameters from the request
    params = request.args.to_dict()

    # Make request to Nominatim
    try:
        response = requests.get(
            'https://nominatim.openstreetmap.org/search',
            params=params,
            headers={
                'User-Agent': 'BestBeerBerths/1.0 (local_debug.py)'
            },
            timeout=10
        )

        # Create a Flask response with the same content and headers
        flask_response = Response(
            response.content,
            status=response.status_code,
            content_type=response.headers.get('content-type', 'application/json')
        )

        # Add CORS headers (though after_request will also add them)
        flask_response.headers.add('Access-Control-Allow-Origin', '*')

        return flask_response
    except Exception as e:
        return Response(
            f'{{"error": "Proxy error: {str(e)}"}}',
            status=500,
            content_type='application/json'
        )

if __name__ == '__main__':
    print("Starting Best Beer Berths debug server with CORS support and Nominatim proxy...")
    print("Open http://localhost:8080/map.html in your browser")
    print("Nominatim requests will be proxied through /proxy/nominatim to avoid CORS issues")
    app.run(host='0.0.0.0', port=8080, debug=True)
