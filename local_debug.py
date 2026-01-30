#!/usr/bin/env python3

import os.path
from flask import Flask, Response, send_from_directory

app = Flask(__name__)
app.config.from_object(__name__)

@app.route('/')
def serve_index():
    return send_from_directory('.', 'map.html')

@app.route('/<path:path>')
def serve_files(path):
    return send_from_directory('.', path)

if __name__ == '__main__':
    print("Starting Best Beer Berths debug server...")
    print("Open http://localhost:8080/map.html in your browser")
    app.run(host='0.0.0.0', port=8080, debug=True)
