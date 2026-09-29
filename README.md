# ISM6427c — Boca Weather

A live weather app powered by the free [Open-Meteo](https://open-meteo.com/) API (no key, no account). Defaults to Florida Atlantic University in Boca Raton, FL.

## Features
- Current conditions, next 24 hours, and a 7-day forecast, refreshed every 10 minutes
- City search (Open-Meteo geocoding) and "use my location"
- °F / °C toggle
- Light, dark, and system themes (remembered per browser)
- Responsive layout for phone, tablet, and desktop
- Time-of-day greeting for Dr. Lee

## Run locally
It's a static site with no build step:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy to Netlify
- **Git:** In Netlify, choose *Add new site → Import an existing project*, pick this repo and the `main` branch. `netlify.toml` already sets the publish directory to the repo root with no build command.
- **Drag and drop:** Drop the repo folder onto https://app.netlify.com/drop.
