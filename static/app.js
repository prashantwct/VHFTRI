let map, userMarker;
let currentHeading = 0;
let sensorsStarted = false;
let currentPos = null;

function initMap() {
    map = L.map('map', { zoomControl: false }).setView([27.7, 85.3], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    
    const arrowIcon = L.divIcon({
        className: 'user-location-icon',
        html: '<div style="width: 20px; height: 20px; background: #007bff; border: 3px solid white; border-radius: 50%; box-shadow: 0 0 10px rgba(0,0,0,0.5);"></div>',
        iconSize: [20, 20]
    });

    userMarker = L.marker([27.7, 85.3], { icon: arrowIcon }).addTo(map);

    // FIX: Use watchPosition instead of hammering getCurrentPosition in a loop
    navigator.geolocation.watchPosition(pos => {
        currentPos = pos;
        const p = [pos.coords.latitude, pos.coords.longitude];
        userMarker.setLatLng(p);
        // Only center map once or when far away to avoid UX jitter
        if (map.getCenter().distanceTo(p) > 500) map.setView(p, 16);
    }, null, { enableHighAccuracy: true });
}

async function startSensors() {
    if (sensorsStarted) return true;
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            const response = await DeviceOrientationEvent.requestPermission();
            if (response === 'granted') {
                window.addEventListener('deviceorientation', handleOrientation);
                sensorsStarted = true;
                return true;
            }
        } catch (e) { console.error("Sensor error:", e); }
    } else {
        window.addEventListener('deviceorientation', handleOrientation);
        sensorsStarted = true;
        return true;
    }
    return false;
}

function handleOrientation(e) {
    currentHeading = e.webkitCompassHeading || (360 - e.alpha);
    if (!currentHeading) return;

    document.getElementById('bearing-val').innerText = Math.round(currentHeading) + "°";
    const crosshair = document.getElementById('crosshair');
    crosshair.style.transform = `translate(-50%, -100%) rotate(${currentHeading}deg)`;
    // Removed getCurrentPosition call from here to save battery
}

document.getElementById('lock-btn').onclick = async () => {
    const active = await startSensors();
    if (!active) { alert("Please enable compass permissions."); return; }
    if (!currentPos) { alert("Waiting for GPS fix..."); return; }

    const data = {
        group_id: "SESSION_" + new Date().toISOString().slice(0, 13), // Group by hour
        pango_id: "P01",
        lat: currentPos.coords.latitude,
        lon: currentPos.coords.longitude,
        bearing: currentHeading
    };

    try {
        const response = await fetch('/sync', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify([data])
        });
        const res = await response.json();
        alert(res.messages[0]);
    } catch (err) {
        // FIX: Basic offline storage
        const pending = JSON.parse(localStorage.getItem('pending_bearings') || '[]');
        pending.push(data);
        localStorage.setItem('pending_bearings', JSON.stringify(pending));
        alert("Offline: Bearing saved locally.");
    }
};

window.onload = initMap;
