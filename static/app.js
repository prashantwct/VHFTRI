let map, userMarker;
let currentHeading = 0;
let sensorsStarted = false;

// Initialize Map
function initMap() {
    // Default to a central location (e.g., Kathmandu region) if GPS isn't ready
    map = L.map('map', { zoomControl: false }).setView([27.7, 85.3], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    
    // Custom marker icon that can be rotated
    const arrowIcon = L.divIcon({
        className: 'user-location-icon',
        html: '<div style="width: 20px; height: 20px; background: #007bff; border: 3px solid white; border-radius: 50%; box-shadow: 0 0 10px rgba(0,0,0,0.5);"></div>',
        iconSize: [20, 20]
    });

    userMarker = L.marker([27.7, 85.3], { icon: arrowIcon }).addTo(map);

    // Initial GPS lock
    navigator.geolocation.getCurrentPosition(pos => {
        const p = [pos.coords.latitude, pos.coords.longitude];
        map.setView(p, 16);
        userMarker.setLatLng(p);
    });
}

// iOS Permission Flow & Sensor Initialization
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
    // Correctly detect heading for both iOS and Android
    currentHeading = e.webkitCompassHeading || (360 - e.alpha);
    if (!currentHeading) return;

    // 1. Update text display
    document.getElementById('bearing-val').innerText = Math.round(currentHeading) + "°";
    
    // 2. Rotate the Antenna Line (Crosshair)
    const crosshair = document.getElementById('crosshair');
    crosshair.style.transform = `translate(-50%, -100%) rotate(${currentHeading}deg)`;

    // 3. Keep user marker updated with GPS
    navigator.geolocation.getCurrentPosition(pos => {
        userMarker.setLatLng([pos.coords.latitude, pos.coords.longitude]);
    }, null, { enableHighAccuracy: true });
}

// Handle data syncing
document.getElementById('lock-btn').onclick = async () => {
    // Required for iOS to start sensors on first click
    const active = await startSensors();
    if (!active) { alert("Please enable compass permissions."); return; }

    navigator.geolocation.getCurrentPosition(async (pos) => {
        const data = {
            group_id: "SESSION_" + new Date().toISOString().slice(0, 16), // Group by minute
            pango_id: "P01",
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
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
        } catch (err) { alert("Sync failed. Check connection."); }
    }, null, { enableHighAccuracy: true });
};

window.onload = initMap;
