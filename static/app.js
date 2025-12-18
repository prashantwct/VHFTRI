let map, userMarker, liveLine;
let currentHeading = 0;
let userPos = [0, 0];

// Initialize Map
function initMap() {
    map = L.map('map', { zoomControl: false }).setView([0, 0], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    userMarker = L.marker([0, 0]).addTo(map);
}

// Request Compass Permission (iOS requirement)
async function startSensors() {
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        const response = await DeviceOrientationEvent.requestPermission();
        if (response === 'granted') window.addEventListener('deviceorientation', handleOrientation);
    } else {
        window.addEventListener('deviceorientation', handleOrientation);
    }
}

function handleOrientation(e) {
    // alpha is rotation around z-axis
    currentHeading = e.webkitCompassHeading || (360 - e.alpha);
    document.getElementById('bearing-val').innerText = Math.round(currentHeading) + "°";
    
    // Rotate the map to match the antenna direction
    map.setBearing(currentHeading); 
}

// Lock Location and Bearing
document.getElementById('lock-btn').onclick = async () => {
    navigator.geolocation.getCurrentPosition(async (pos) => {
        const data = {
            group_id: "SESSION_" + Date.now(),
            pango_id: "P01",
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            bearing: currentHeading,
            time: new Date().toISOString()
        };

        // Sync to your Python Flask route
        const response = await fetch('/sync', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify([data])
        });
        
        const res = await response.json();
        alert(res.messages[0]);
    }, null, { enableHighAccuracy: true });
};

window.onload = () => {
    initMap();
    startSensors();
};
