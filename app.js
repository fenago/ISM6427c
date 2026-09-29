(function () {
  'use strict';

  // Florida Atlantic University, Boca Raton campus
  var DEFAULT_PLACE = {
    name: 'Boca Raton',
    detail: 'Florida Atlantic University · FL, United States',
    latitude: 26.3754,
    longitude: -80.1011
  };

  var FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
  var GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
  var REFRESH_MS = 10 * 60 * 1000;

  // WMO weather interpretation codes -> [description, day icon, night icon]
  var WMO = {
    0: ['Clear sky', '☀️', '🌙'],
    1: ['Mainly clear', '🌤️', '🌙'],
    2: ['Partly cloudy', '⛅', '☁️'],
    3: ['Overcast', '☁️', '☁️'],
    45: ['Fog', '🌫️', '🌫️'],
    48: ['Freezing fog', '🌫️', '🌫️'],
    51: ['Light drizzle', '🌦️', '🌧️'],
    53: ['Drizzle', '🌦️', '🌧️'],
    55: ['Heavy drizzle', '🌧️', '🌧️'],
    56: ['Freezing drizzle', '🌧️', '🌧️'],
    57: ['Heavy freezing drizzle', '🌧️', '🌧️'],
    61: ['Light rain', '🌦️', '🌧️'],
    63: ['Rain', '🌧️', '🌧️'],
    65: ['Heavy rain', '🌧️', '🌧️'],
    66: ['Freezing rain', '🌧️', '🌧️'],
    67: ['Heavy freezing rain', '🌧️', '🌧️'],
    71: ['Light snow', '🌨️', '🌨️'],
    73: ['Snow', '🌨️', '🌨️'],
    75: ['Heavy snow', '❄️', '❄️'],
    77: ['Snow grains', '🌨️', '🌨️'],
    80: ['Light showers', '🌦️', '🌧️'],
    81: ['Showers', '🌧️', '🌧️'],
    82: ['Violent showers', '⛈️', '⛈️'],
    85: ['Snow showers', '🌨️', '🌨️'],
    86: ['Heavy snow showers', '❄️', '❄️'],
    95: ['Thunderstorm', '⛈️', '⛈️'],
    96: ['Thunderstorm with hail', '⛈️', '⛈️'],
    99: ['Severe thunderstorm with hail', '⛈️', '⛈️']
  };

  function wmo(code, isDay) {
    var w = WMO[code] || ['Unknown', '🌡️', '🌡️'];
    return { text: w[0], icon: isDay === 0 ? w[2] : w[1] };
  }

  // ---------- storage helpers ----------
  function load(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, value); } catch (e) {}
  }

  var $ = function (id) { return document.getElementById(id); };

  var state = {
    place: DEFAULT_PLACE,
    unit: load('unit') === 'celsius' ? 'celsius' : 'fahrenheit',
    theme: load('theme') || 'system',
    timer: null
  };

  try {
    var saved = JSON.parse(load('place'));
    if (saved && typeof saved.latitude === 'number') state.place = saved;
  } catch (e) {}

  // ---------- theme ----------
  function applyTheme(choice) {
    state.theme = choice;
    save('theme', choice);
    var root = document.documentElement;
    if (choice === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', choice);
    document.querySelectorAll('[data-theme-choice]').forEach(function (b) {
      b.setAttribute('aria-checked', String(b.dataset.themeChoice === choice));
    });
  }

  document.querySelectorAll('[data-theme-choice]').forEach(function (b) {
    b.addEventListener('click', function () { applyTheme(b.dataset.themeChoice); });
  });

  // ---------- units ----------
  function applyUnitButtons() {
    document.querySelectorAll('[data-unit]').forEach(function (b) {
      b.setAttribute('aria-checked', String(b.dataset.unit === state.unit));
    });
  }
  document.querySelectorAll('[data-unit]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (state.unit === b.dataset.unit) return;
      state.unit = b.dataset.unit;
      save('unit', state.unit);
      applyUnitButtons();
      fetchWeather();
    });
  });

  // ---------- greeting ----------
  function renderGreeting() {
    var h = new Date().getHours();
    var part = h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    $('greeting').textContent = part + ', Dr. Lee 👋';
    var d = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    $('greeting-sub').textContent = 'Welcome back. It’s ' + d + ' — here’s the weather.';
  }

  // ---------- status ----------
  function setStatus(msg, isError) {
    var el = $('status');
    el.textContent = msg || '';
    el.classList.toggle('error', !!isError);
  }

  // ---------- formatting ----------
  function tUnit() { return state.unit === 'celsius' ? '°C' : '°F'; }
  function round(n) { return Math.round(n); }
  function hourLabel(iso) {
    // Times from the API are local to the location (timezone=auto); parse without converting.
    var h = parseInt(iso.slice(11, 13), 10);
    var suffix = h >= 12 ? 'PM' : 'AM';
    return (h % 12 || 12) + ' ' + suffix;
  }
  function clockLabel(iso) {
    var h = parseInt(iso.slice(11, 13), 10);
    var m = iso.slice(14, 16);
    return (h % 12 || 12) + ':' + m + ' ' + (h >= 12 ? 'PM' : 'AM');
  }
  function dayLabel(iso, i) {
    if (i === 0) return 'Today';
    var parts = iso.split('-');
    var d = new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2]));
    return d.toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' });
  }
  function compass(deg) {
    var dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return dirs[Math.round(deg / 45) % 8];
  }
  function uvLabel(uv) {
    if (uv == null) return '—';
    var r = round(uv);
    var l = r < 3 ? 'Low' : r < 6 ? 'Moderate' : r < 8 ? 'High' : r < 11 ? 'Very high' : 'Extreme';
    return r + ' · ' + l;
  }

  // ---------- weather ----------
  function fetchWeather() {
    var p = state.place;
    var params = new URLSearchParams({
      latitude: p.latitude,
      longitude: p.longitude,
      current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl',
      hourly: 'temperature_2m,precipitation_probability,weather_code,is_day,uv_index',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max',
      temperature_unit: state.unit,
      wind_speed_unit: state.unit === 'celsius' ? 'kmh' : 'mph',
      precipitation_unit: state.unit === 'celsius' ? 'mm' : 'inch',
      timezone: 'auto',
      forecast_days: 7
    });

    setStatus('Loading live weather for ' + p.name + '…');
    return fetch(FORECAST_URL + '?' + params.toString())
      .then(function (r) {
        if (!r.ok) throw new Error('Weather service returned ' + r.status);
        return r.json();
      })
      .then(function (data) {
        render(data);
        setStatus('');
      })
      .catch(function (err) {
        setStatus('Couldn’t load the weather: ' + err.message + '. Retrying soon.', true);
      })
      .finally(scheduleRefresh);
  }

  function scheduleRefresh() {
    clearTimeout(state.timer);
    state.timer = setTimeout(fetchWeather, REFRESH_MS);
  }

  function render(data) {
    var c = data.current;
    var d = data.daily;
    var h = data.hourly;
    var cw = wmo(c.weather_code, c.is_day);
    var speed = state.unit === 'celsius' ? 'km/h' : 'mph';
    var precipUnit = state.unit === 'celsius' ? 'mm' : 'in';

    $('place').textContent = state.place.name + (state.place.detail ? ' — ' + state.place.detail : '');
    $('updated').textContent = 'Updated ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + ' (local time at location: ' + clockLabel(c.time) + ')';
    $('cur-icon').textContent = cw.icon;
    $('cur-temp').textContent = round(c.temperature_2m) + tUnit();
    $('cur-desc').textContent = cw.text;
    $('cur-hilo').textContent = 'H ' + round(d.temperature_2m_max[0]) + '° · L ' + round(d.temperature_2m_min[0]) + '°';

    // Current-hour index in the hourly arrays (both use the location's local time).
    var nowIdx = h.time.indexOf(c.time.slice(0, 13) + ':00');
    if (nowIdx < 0) nowIdx = 0;

    $('s-feels').textContent = round(c.apparent_temperature) + '°';
    $('s-hum').textContent = c.relative_humidity_2m + '%';
    $('s-wind').textContent = round(c.wind_speed_10m) + ' ' + speed + ' ' + compass(c.wind_direction_10m) +
      (c.wind_gusts_10m ? ' (gusts ' + round(c.wind_gusts_10m) + ')' : '');
    $('s-uv').textContent = uvLabel(h.uv_index[nowIdx]);
    $('s-press').textContent = state.unit === 'celsius'
      ? round(c.pressure_msl) + ' hPa'
      : (c.pressure_msl * 0.02953).toFixed(2) + ' inHg';
    $('s-precip').textContent = c.precipitation + ' ' + precipUnit;
    $('s-rise').textContent = clockLabel(d.sunrise[0]);
    $('s-set').textContent = clockLabel(d.sunset[0]);

    // Hourly: next 24 hours
    var hourly = $('hourly');
    hourly.textContent = '';
    for (var i = nowIdx; i < Math.min(nowIdx + 24, h.time.length); i++) {
      var hw = wmo(h.weather_code[i], h.is_day[i]);
      var pop = h.precipitation_probability[i];
      var el = document.createElement('div');
      el.className = 'hour';
      el.innerHTML =
        '<div class="h-time"></div><div class="h-icon" aria-hidden="true"></div>' +
        '<div class="h-temp"></div><div class="h-pop"></div>';
      el.children[0].textContent = i === nowIdx ? 'Now' : hourLabel(h.time[i]);
      el.children[1].textContent = hw.icon;
      el.children[2].textContent = round(h.temperature_2m[i]) + '°';
      el.children[3].textContent = pop ? '💧' + pop + '%' : '';
      el.title = hw.text;
      hourly.appendChild(el);
    }

    // Daily
    var lo = Math.min.apply(null, d.temperature_2m_min);
    var hi = Math.max.apply(null, d.temperature_2m_max);
    var span = hi - lo || 1;
    var daily = $('daily');
    daily.textContent = '';
    d.time.forEach(function (t, i) {
      var dw = wmo(d.weather_code[i], 1);
      var pop = d.precipitation_probability_max[i];
      var li = document.createElement('li');
      li.className = 'day';
      li.innerHTML =
        '<span class="d-name"></span><span class="d-icon" aria-hidden="true"></span>' +
        '<span class="d-pop"></span>' +
        '<span class="d-bar"><span class="d-lo"></span><span class="range"><span></span></span><span class="d-hi"></span></span>';
      li.querySelector('.d-name').textContent = dayLabel(t, i);
      li.querySelector('.d-icon').textContent = dw.icon;
      li.querySelector('.d-pop').textContent = pop ? '💧' + pop + '%' : '';
      li.querySelector('.d-lo').textContent = round(d.temperature_2m_min[i]) + '°';
      li.querySelector('.d-hi').textContent = round(d.temperature_2m_max[i]) + '°';
      var bar = li.querySelector('.range span');
      bar.style.left = ((d.temperature_2m_min[i] - lo) / span * 100) + '%';
      bar.style.right = ((hi - d.temperature_2m_max[i]) / span * 100) + '%';
      li.title = dw.text;
      daily.appendChild(li);
    });

    $('current').hidden = false;
    $('hourly-card').hidden = false;
    $('daily-card').hidden = false;
    document.title = round(c.temperature_2m) + tUnit() + ' ' + state.place.name + ' · Boca Weather';
  }

  // ---------- place selection ----------
  function setPlace(place) {
    state.place = place;
    save('place', JSON.stringify(place));
    fetchWeather();
  }

  $('home-btn').addEventListener('click', function () {
    $('search-input').value = '';
    hideResults();
    setPlace(DEFAULT_PLACE);
  });

  $('locate-btn').addEventListener('click', function () {
    if (!navigator.geolocation) {
      setStatus('Location isn’t available in this browser.', true);
      return;
    }
    setStatus('Finding your location…');
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        setPlace({
          name: 'My location',
          detail: pos.coords.latitude.toFixed(2) + ', ' + pos.coords.longitude.toFixed(2),
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude
        });
      },
      function (err) {
        setStatus('Couldn’t get your location: ' + err.message, true);
      },
      { timeout: 10000, maximumAge: 300000 }
    );
  });

  // ---------- search ----------
  var input = $('search-input');
  var results = $('search-results');
  var searchTimer = null;
  var searchSeq = 0;
  var matches = [];
  var active = -1;

  function hideResults() {
    results.hidden = true;
    results.textContent = '';
    matches = [];
    active = -1;
  }

  function describe(m) {
    return [m.admin1, m.country].filter(Boolean).join(', ');
  }

  function showResults(list) {
    matches = list;
    active = -1;
    results.textContent = '';
    if (!list.length) {
      var none = document.createElement('li');
      none.className = 'muted';
      none.textContent = 'No places found';
      results.appendChild(none);
    }
    list.forEach(function (m, i) {
      var li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.id = 'opt-' + i;
      var strong = document.createElement('strong');
      strong.textContent = m.name;
      var sub = document.createElement('div');
      sub.className = 'muted';
      sub.textContent = describe(m);
      li.appendChild(strong);
      li.appendChild(sub);
      li.addEventListener('mousedown', function (e) { e.preventDefault(); choose(i); });
      results.appendChild(li);
    });
    results.hidden = false;
  }

  function choose(i) {
    var m = matches[i];
    if (!m) return;
    input.value = '';
    hideResults();
    input.blur();
    setPlace({ name: m.name, detail: describe(m), latitude: m.latitude, longitude: m.longitude });
  }

  function highlight(i) {
    var items = results.querySelectorAll('[role="option"]');
    items.forEach(function (el, j) { el.setAttribute('aria-selected', String(j === i)); });
    active = i;
    if (items[i]) {
      input.setAttribute('aria-activedescendant', items[i].id);
      items[i].scrollIntoView({ block: 'nearest' });
    }
  }

  function search(q) {
    var seq = ++searchSeq;
    var params = new URLSearchParams({ name: q, count: 8, language: 'en', format: 'json' });
    fetch(GEOCODE_URL + '?' + params.toString())
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (seq !== searchSeq || input.value.trim().length < 2) return;
        showResults(data.results || []);
      })
      .catch(function () {
        if (seq === searchSeq) setStatus('City search is unavailable right now.', true);
      });
  }

  input.addEventListener('input', function () {
    clearTimeout(searchTimer);
    var q = input.value.trim();
    if (q.length < 2) { searchSeq++; hideResults(); return; }
    searchTimer = setTimeout(function () { search(q); }, 300);
  });

  input.addEventListener('keydown', function (e) {
    if (results.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); highlight(Math.min(active + 1, matches.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); highlight(Math.max(active - 1, 0)); }
    else if (e.key === 'Escape') { hideResults(); }
  });

  input.addEventListener('blur', function () { setTimeout(hideResults, 150); });

  $('search-form').addEventListener('submit', function (e) {
    e.preventDefault();
    if (matches.length) choose(active >= 0 ? active : 0);
  });

  // Refresh when the tab comes back into view.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      renderGreeting();
      fetchWeather();
    }
  });

  // ---------- init ----------
  applyTheme(state.theme);
  applyUnitButtons();
  renderGreeting();
  fetchWeather();
})();
