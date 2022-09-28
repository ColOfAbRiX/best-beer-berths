#!/usr/bin/env python3

import os.path
from flask import Flask, Response, send_from_directory

app = Flask(__name__)
app.config.from_object(__name__)

@app.route('/<path:path>')
def serve_files(path):
    return send_from_directory('.', path)
