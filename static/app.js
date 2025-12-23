let map, userMarker;
let currentHeading = 0;
let sensorsStarted = false;

function initMap() {
    // Start at a default or current location
    map = L.map('map', { zoomControl: false }).setView([27.7, 85.3], 13); 
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    userMarker = L.marker([27.7, 85.3]).addTo(map);

    // Update location immediately
    navigator.geolocation.getCurrentPosition(pos => {
        const p = [pos.coords.latitude, pos.coords.longitude];
        map.setView(p, 15);
        userMarker.setLatLng(p);
    });
}

// Fault Fix: iOS requires a user gesture to request permissions
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
        } catch (e) { console.error(e); }
    } else {
        window.addEventListener('deviceorientation', handleOrientation);
        sensorsStarted = true;
        return true;
    }
    return false;
}

function handleOrientation(e) {
    currentHeading = e.webkitCompassHeading || (360 - e.alpha);
    document.getElementById('bearing-val').innerText = Math.round(currentHeading) + "°";
    
    // Fault Fix: Leaflet doesn't have setBearing. 
    // We rotate the marker or the CSS container instead.
    const icon = document.querySelector('.leaflet-marker-icon');
    if (icon) icon.style.transform += ` rotate(${currentHeading}deg)`;
}

document.getElementById('lock-btn').onclick = async () => {
    // Activate sensors on first click (iOS compliance)
    const active = await startSensors();
    if (!active) { alert("Compass access denied"); return; }

    navigator.geolocation.getCurrentPosition(async (pos) => {
        const data = {
            // Fault Fix: use a slightly more unique ID or a shared session ID
            group_id: "SESSION_" + new Date().toISOString().slice(0,13), 
            pango_id: "P01",
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            bearing: currentHeading,
            time: new Date().toISOString()
        };

        try {
            const response = await fetch('/sync', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify([data])
            });
            const res = await response.json();
            alert(res.messages[0]);
        } catch (err) { alert("Sync failed"); }
    }, null, { enableHighAccuracy: true });
};

window.onload = initMap;
