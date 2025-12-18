import os
from flask import Flask, request, jsonify, render_template, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from dotenv import load_dotenv
import numpy as np
from pyproj import Transformer
from datetime import datetime

# --- CONFIG & INIT ---
load_dotenv() 

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'sqlite:///vhf_data.db') 
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-key-fallback')

db = SQLAlchemy(app)

# --- MODELS ---
class RawBearing(db.Model):
    __tablename__ = 'raw_bearings'
    id = db.Column(db.Integer, primary_key=True)
    group_id = db.Column(db.String(80), index=True)
    pango_id = db.Column(db.String(10))
    obs_lat = db.Column(db.Float)
    obs_lon = db.Column(db.Float)
    bearing = db.Column(db.Float)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

class CalculatedFix(db.Model):
    __tablename__ = 'calculated_fixes'
    id = db.Column(db.Integer, primary_key=True)
    group_id = db.Column(db.String(80), index=True)
    calc_lat = db.Column(db.Float)
    calc_lon = db.Column(db.Float)
    note = db.Column(db.String(255))

# --- TRIANGULATION MATH ---
# Transforms Lat/Lon to Meters (UTM Zone 44N - India/Nepal)
to_xy = Transformer.from_crs("EPSG:4326", "EPSG:32644", always_xy=True)
to_ll = Transformer.from_crs("EPSG:32644", "EPSG:4326", always_xy=True)

def perform_triangulation(readings):
    try:
        A, B = [], []
        for lat, lon, brng in readings:
            x, y = to_xy.transform(lon, lat)
            rad = np.deg2rad(brng)
            dx, dy = np.sin(rad), np.cos(rad)
            A.append([dy, -dx])
            B.append(dy * x - dx * y)
        
        sol, residuals, rank, s = np.linalg.lstsq(np.array(A), np.array(B), rcond=None)
        calc_lon, calc_lat = to_ll.transform(sol[0], sol[1])
        error = np.sqrt(residuals[0] / len(readings)) if len(residuals) > 0 else 0
        return (calc_lat, calc_lon, error)
    except Exception as e:
        return str(e)

# --- ROUTES ---
@app.route('/')
def home(): return render_template('index.html')

@app.route('/manifest.json')
def manifest(): return send_from_directory('.', 'manifest.json')

@app.route('/sw.js')
def sw(): return send_from_directory('.', 'sw.js')

@app.route('/sync', methods=['POST'])
def sync_data():
    incoming = request.json
    for item in incoming:
        new_raw = RawBearing(
            group_id=item['group_id'], 
            obs_lat=item['lat'], obs_lon=item['lon'], 
            bearing=item['bearing'], pango_id=item['pango_id']
        )
        db.session.add(new_raw)
    db.session.commit()

    # Automatically attempt triangulation if 2+ points exist for this group
    gid = incoming[0]['group_id']
    all_readings = RawBearing.query.filter_by(group_id=gid).all()
    if len(all_readings) >= 2:
        pts = [(r.obs_lat, r.obs_lon, r.bearing) for r in all_readings]
        res = perform_triangulation(pts)
        if isinstance(res, tuple):
            new_fix = CalculatedFix(group_id=gid, calc_lat=res[0], calc_lon=res[1], note=f"Err: {res[2]:.1f}m")
            db.session.add(new_fix)
            db.session.commit()
            return jsonify({"status": "success", "messages": [f"Fix Found! Error: {res[2]:.1f}m"]})
    
    return jsonify({"status": "saved", "messages": ["Bearing saved. Need more points for fix."]})

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(host='0.0.0.0', port=5000, debug=True)
