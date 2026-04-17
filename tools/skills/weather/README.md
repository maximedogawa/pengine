---
name: weather
description: Get current weather for any location with a single fetch — no API key.
version: 1.1.0
author: Peter Steinberger (@steipete)
source: https://clawhub.ai/steipete/weather
license: MIT-0
tags: [weather, forecast, climate]
requires: []
---

# Weather

For ANY "weather in X" / "X weather forecast" question, make **exactly one** `fetch` call and return the result. Do not probe multiple services.

## The one call

```
https://wttr.in/<LOCATION>?format=3
```

Replace `<LOCATION>` with the place from the user (URL-encode spaces as `%20`). Response is a single line like `Vienna: ⛅ +14°C`. Return that as your answer — do not fetch anything else.

## Only if the user explicitly asks for hourly / numeric data

Then (and only then) use Open-Meteo. Skip otherwise.

```
https://api.open-meteo.com/v1/forecast?latitude=<LAT>&longitude=<LON>&current_weather=true&timezone=auto
```

Geocode first: `https://geocoding-api.open-meteo.com/v1/search?name=<LOCATION>&count=1` → `results[0].{latitude,longitude}`.

Weather codes: 0 clear · 1-3 cloudy · 45/48 fog · 51-67 rain · 71-77 snow · 80-82 showers · 95-99 thunder.
