// Load locations from JSON file
let locations = [];

document.addEventListener('DOMContentLoaded', async () => {
  // Fetch locations from data.json
  try {
    const response = await fetch('data.json');
    const data = await response.json();
    locations = data.locations;
  } catch(error) {
    console.error('Error loading data.json:', error);
    alert('Failed to load tour data');
    return;
  }

  // Render Locations - with images and field notes
  const panel = document.querySelector('.locations-panel');
  locations.forEach((loc, idx) => {
    const card = document.createElement('div');
    card.className = 'location-card';
    card.tabIndex = 0;
    card.innerHTML = `
      <img src="${loc.imageUrl}" alt="${loc.name}" class="location-image" onerror="this.style.display='none'" />
      <div class="location-title">${loc.name}</div>
      <div class="location-desc">${loc.description}</div>
      <div class="location-analysis">${loc.analysis}</div>
      <div class="location-notes"><strong>Field Notes:</strong> ${loc.fieldNotes}</div>
      <svg class="expand-arrow" viewBox="0 0 16 16"><polyline points="4 6 8 10 12 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"></polyline></svg>
    `;
    card.addEventListener('click', () => {
      if(card.classList.contains('expanded')) {
        card.classList.remove('expanded');
      } else {
        card.classList.toggle('expanded');
      }
      selectMarker(idx);
    });
    card.addEventListener('keydown', e => {
      if(e.key==='Enter'||e.key===' ') card.click();
    });
    panel.insertBefore(card, panel.querySelector('.credit-card'));
  });

  let selectedIndexes = [];

  // Leaflet map instantiation
  const map = L.map('map', {
    center: [45.5350, -73.6145],
    zoom: 16,
    zoomControl: false,
    attributionControl: true,
    scrollWheelZoom: true,
    preferCanvas: true
  });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors | Tiles: openstreetmap.org',
    maxZoom: 19,
  }).addTo(map);
  map.setMinZoom(13);

  // Custom marker icon
  function getMarkerIcon(idx) {
    const circleSvg = encodeURIComponent(`<svg width="36" height="36" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg"><circle cx="18" cy="18" r="16" fill="${["#1FB8CD", "#FFC185", "#B4413C", "#5D878F", "#DB4545"][idx%5]}" stroke="#21808D" stroke-width="2"/><text x="18" y="23" font-size="16" fill="#fff" font-family="Inter,Arial" text-anchor="middle" alignment-baseline="middle">${idx+1}</text></svg>`);
    return L.icon({
      iconUrl: `data:image/svg+xml,${circleSvg}`,
      iconSize: [38,38],
      iconAnchor: [19,34],
      className: 'custom-marker',
      popupAnchor: [0,-34]
    });
  }

  // Add markers
  const markers = locations.map((loc, idx) => {
    const marker = L.marker([loc.lat, loc.lon], { icon: getMarkerIcon(idx), riseOnHover: true }).addTo(map);
    marker.on('click', ()=>selectMarker(idx));
    marker.bindTooltip(loc.name, {direction:'top',permanent:false,className:'tour-tooltip'});
    return marker;
  });

  // Marker selection logic
  function selectMarker(idx) {
    let changed = false;
    if(selectedIndexes.includes(idx)) {
      selectedIndexes = selectedIndexes.filter(i=>i!==idx);
      changed = true;
    } else {
      if(selectedIndexes.length<2) {
        selectedIndexes.push(idx);
        changed = true;
      } else {
        const firstIdx = selectedIndexes[0];
        const cards = document.querySelectorAll('.location-card');
        if(cards[firstIdx]) {
          cards[firstIdx].classList.remove('expanded');
        }
        selectedIndexes.shift();
        selectedIndexes.push(idx);
        changed = true;
      }
    }
    updateSelections();
  }

  function updateSelections() {
    // Highlight location cards
    document.querySelectorAll('.location-card').forEach((el,i)=>{
      if(selectedIndexes.includes(i)) el.classList.add('selected');
      else el.classList.remove('selected');
    });
    // Highlight markers, popups
    markers.forEach((mk,i)=>{
      if(selectedIndexes.includes(i)) {
        mk.setZIndexOffset(1000);
        mk.openTooltip();
      } else {
        mk.setZIndexOffset(0);
        mk.closeTooltip();
      }
    });
    // Draw walking line if two selected
    drawWalkingLine();
    // Show/hide route panel
    document.getElementById('routeInfo').style.display = (selectedIndexes.length==2)?'block':'none';
  }

  async function drawWalkingLine() {
    if(window.animatedLineLayer) {
      map.removeLayer(window.animatedLineLayer);
      window.animatedLineLayer = undefined;
    }
    if(window.walkingArrowMarker) {
      map.removeLayer(window.walkingArrowMarker);
      window.walkingArrowMarker = undefined;
    }

    const rp = document.getElementById('routeInfo');
    rp.innerHTML = '';

    if(selectedIndexes.length===2) {
      const iA = selectedIndexes[0], iB = selectedIndexes[1];
      const ptA = [locations[iA].lat, locations[iA].lon];
      const ptB = [locations[iB].lat, locations[iB].lon];

      // Fetch street-based route from OSRM API
      try {
        const url = `https://router.project-osrm.org/route/v1/foot/${ptA[1]},${ptA[0]};${ptB[1]},${ptB[0]}?overview=full&geometries=geojson`;
        const response = await fetch(url);
        const data = await response.json();

        if(data.code === 'Ok' && data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          const coords = route.geometry.coordinates.map(c => [c[1], c[0]]);
          const distKm = route.distance / 1000;
          const durationMin = Math.round(route.duration / 60);

          rp.innerHTML = `
            <span><strong>Route:</strong> ${locations[iA].name} <span style="font-size:18px;">→</span> ${locations[iB].name}</span>
            <span>| <strong>Distance:</strong> ${distKm.toFixed(2)} km</span>
            <span>| <strong>Walking time:</strong> ${durationMin} min</span>
            <button class="btn-clear">Clear</button>
          `;
          rp.querySelector('.btn-clear').onclick = clearRoute;

          window.animatedLineLayer = L.polyline(coords, {
            color: '#1FB8CD',
            weight: 4,
            opacity: 0.8,
            smoothFactor: 1
          }).addTo(map);
        } else {
          throw new Error('No route found');
        }
      } catch(error) {
        console.error('OSRM routing error:', error);
        // Fallback to straight line
        const dist = map.distance(ptA,ptB)/1000;
        const minutes = Math.round((dist/4.3)*60);

        rp.innerHTML = `
          <span><strong>Route:</strong> ${locations[iA].name} <span style="font-size:18px;">→</span> ${locations[iB].name}</span>
          <span>| <strong>Distance:</strong> ${dist.toFixed(2)} km</span>
          <span>| <strong>Walking time:</strong> ${minutes} min approx.</span>
          <button class="btn-clear">Clear</button>
        `;
        rp.querySelector('.btn-clear').onclick = clearRoute;

        window.animatedLineLayer = L.polyline([ptA,ptB], {
          color: '#1FB8CD',
          weight: 4,
          opacity: 0.8,
          dashArray: '8,4'
        }).addTo(map);
      }
    }
  }

  // Clear everything function
  function clearRoute() {
    selectedIndexes = [];

    if(window.animatedLineLayer) {
      map.removeLayer(window.animatedLineLayer);
      window.animatedLineLayer = undefined;
    }
    if(window.walkingArrowMarker) {
      map.removeLayer(window.walkingArrowMarker);
      window.walkingArrowMarker = undefined;
    }

    // Clear all cards
    document.querySelectorAll('.location-card').forEach(el => {
      el.classList.remove('expanded');
      el.classList.remove('selected');
    });

    updateSelections();
  }

  const clearBtn = document.getElementById('clearBtn');
  if(clearBtn) {
    clearBtn.addEventListener('click', clearRoute);
  }

  map.on('click',()=>{
    clearRoute();
  });

  updateSelections();

  L.control.zoom({position: 'topright'}).addTo(map);
});
