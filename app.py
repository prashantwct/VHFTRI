import os
from flask import Flask, request, jsonify, render_template
from flask_sqlalchemy import SQLAlchemy
from dotenv import load_dotenv
import numpy as np
from pyproj import Transformer
from datetime import datetime
import re

load_dotenv() 

app = Flask(__name__)
# FIX: Use environment variables, default to safe local values
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'sqlite:///vhf_data.db') 
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'default-change-me-in-prod')

db = SQLAlchemy(app)

# ... (Models RawBearing and CalculatedFix remain same) ...

# UTM Zone 44N (Specific to India/Nepal)
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
        
        # FIX: Added robustness to triangulation
        sol, residuals, rank, s = np.linalg.lstsq(np.array(A), np.array(B), rcond=None)
        if rank < 2: return "Insufficient geometric diversity for fix."
        
        calc_lon, calc_lat = to_ll.transform(sol[0], sol[1])
        error = np.sqrt(residuals[0] / len(readings)) if len(residuals) > 0 else 0
        return (calc_lat, calc_lon, error)
    except Exception as e:
        return str(e)

@app.route('/sync', methods=['POST'])
def sync_data():
    incoming = request.json
    if not incoming or not isinstance(incoming, list): 
        return jsonify({"status": "error", "message": "Invalid data format"}), 400
    
    # FIX: Sanitize group_id to prevent injection-style attacks
    gid = str(incoming[0].get('group_id', ''))
    if not re.match(r'^SESSION_[\d\-T:]+$', gid):
        return jsonify({"status": "error", "message": "Invalid Group ID"}), 403

    for item in incoming:
        new_raw = RawBearing(
            group_id=gid, 
            obs_lat=item['lat'], obs_lon=item['lon'], 
            bearing=item['bearing'], pango_id=item.get('pango_id', 'P01')
        )
        db.session.add(new_raw)
    db.session.commit()

    all_readings = RawBearing.query.filter_by(group_id=gid).all()
    if len(all_readings) >= 2:
        pts = [(r.obs_lat, r.obs_lon, r.bearing) for r in all_readings]
        res = perform_triangulation(pts)
        if isinstance(res, tuple):
            new_fix = CalculatedFix(group_id=gid, calc_lat=res[0], calc_lon=res[1], note=f"Err: {res[2]:.1f}m")
            db.session.add(new_fix)
            db.session.commit()
            return jsonify({"status": "success", "messages": [f"Fix Found! Error: {res[2]:.1f}m"]})
    
    return jsonify({"status": "saved", "messages": ["Bearing recorded."] })
