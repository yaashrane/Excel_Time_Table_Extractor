"""
Flask Application Entry Point
-----------------------------
Run with:  python app.py
"""

import logging
from pathlib import Path
from flask import Flask, send_from_directory, session, redirect, url_for, jsonify, current_app
from flask_cors import CORS

from config import Config
from api import api_bp, mail

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
    mail.init_app(app)

    # CORS
    CORS(app, resources={r"/api/*": {"origins": Config.CORS_ORIGINS}}, supports_credentials=True)

    # Logging
    logging.basicConfig(
        level=logging.DEBUG,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[logging.StreamHandler()]
    )
    app.logger.setLevel(logging.DEBUG)

    # Routes
    app.register_blueprint(api_bp)

    # Serve frontend
    @app.route("/")
    def index():
        if not session.get("logged_in"):
            return redirect(url_for("login_page"))
        return send_from_directory(app.static_folder, "index.html")

    @app.route("/login")
    def login_page():
        if session.get("logged_in"):
            return redirect(url_for("index"))
        return send_from_directory(app.static_folder, "login.html")

    @app.errorhandler(413)
    def too_large(_):
        return {"error": "File too large (max 16 MB)"}, 413

    @app.errorhandler(404)
    def not_found(_):
        return {"error": "Not found"}, 404

    @app.errorhandler(500)
    def server_error(e):
        import traceback
        current_app.logger.error(traceback.format_exc())
        return jsonify({"error": str(e)}), 500

    return app


if __name__ == "__main__":
    app = create_app()
    app.run(host="0.0.0.0", port=5000, debug=Config.DEBUG)

# Module-level app for gunicorn: gunicorn app:app
app = create_app()