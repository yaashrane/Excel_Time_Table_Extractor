"""
Flask Application Entry Point
-----------------------------
Run with:  python app.py
"""

import logging
from pathlib import Path
from flask import Flask, send_from_directory
from flask_cors import CORS

from config import Config
from api import api_bp

import os
os.makedirs("uploads", exist_ok=True)


def create_app() -> Flask:
    app = Flask(
        __name__,
        static_folder=str(Path(__file__).resolve().parent),
        static_url_path="",
    )
    app.config.from_object(Config)
    Config.init_app()

    # CORS
    CORS(app, resources={r"/api/*": {"origins": Config.CORS_ORIGINS}})

    # Logging
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s [%(levelname)s] %(message)s")

    # Routes
    app.register_blueprint(api_bp)

    # Serve frontend
    @app.route("/")
    def index():
        return send_from_directory(app.static_folder, "index.html")

    @app.errorhandler(413)
    def too_large(_):
        return {"error": "File too large (max 16 MB)"}, 413

    @app.errorhandler(404)
    def not_found(_):
        return {"error": "Not found"}, 404

    return app


if __name__ == "__main__":
    create_app().run(host="0.0.0.0", port=5000, debug=Config.DEBUG)