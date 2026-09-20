----------------------------  ⚠️  ----------------------------  
Dieses Projekt wird nicht mehr gepflegt und funktioniert   
mit aktuellen Abhängigkeiten oder Systemen möglicherweise   
nicht mehr. Es bleibt als Referenz online.  
----------------------------  ⚠️  ----------------------------   

# MMM-Currentweather-MQTT

The MMM-Currentweather-MQTT is based an the standard module `currentweather` and the module [`MMM-MQTT`](https://github.com/ottopaulsen/MMM-MQTT).

The `currentweather` module is one of the default modules of the MagicMirror.
This module displays the current weather, including the windspeed, the sunset or sunrise time, the temperature and an icon to display the current conditions.

If the values originate from MQTT telegrams, the values are displayed in white. If the values are from Openweather, they are displayed in yellow.

For configuration options, please check the [MagicMirror² documentation](https://docs.magicmirror.builders/modules/currentweather.html).
## Screenshot

![Screenshot](weather_screenshot.png)

with minimum and maximum temperature as supplied via MQTT

![Screenshot](MMM-Currentweather-MQTT-minmax.jpg)

## Installation

Go to `MagicMirror/modules` and write

```
    git clone https://github.com/spitzlbergerj/MMM-Currentweather-MQTT
    cd MMM-Currentweather-MQTT
    npm install
```



## Configuration

Attention - first version with rigid processing of my MQTT telegrams

Here is an example configuration with description. Put it in the `MagicMirror/config/config.js` file:

```javascript
{
	module: "MMM-Currentweather-MQTT",
	position: "top_right",
	config: {
		location: "XYZ",
		locationID: "1234567",
		appid: "<yourAppID>",
		roundTemp: true,
		degreeLabel: true,
		showWindDirection: true,
		showWindDirectionAsArrow: true,
		showHumidity: true,
		showFeelsLike: false,
		useBeaufort: false,
		useKMPHwind: true,
		logging: true,
		useWildcards: false,
		showTempMax: true,
		showTempMin: true,
		mqttServers: [
			{
				address: 'xxx.xxx.xxx.xxx',  // Server address or IP address
				port: '1883',                // Port number if other than default
				subscriptions: [             // for now, all seven values must be 
				                             // specified in the config, 
							     // even if they are not delivered and not displayed.
					{
						topic: 'wetter/act-temp', // Topic to look for
						suffix: '°C',             // Displayed after the value
						decimals: 0,              // Round numbers to this number of decimals
						sortOrder: 10,            // sortOrder 10 has to contain the temperature 
						maxAgeSeconds: 18000,     // take Openweather value if older than 5 hours
					},
					{
						topic: 'wetter/act-hum',
						suffix: '%',
						decimals: 0,
						sortOrder: 20,            // sortOrder 210 has to contain the humidity
						maxAgeSeconds: 18000,
					},
					{
						topic: 'wetter/act-illum',
						sortOrder: 30,            // sortOrder 30 has to contain the illumination
						maxAgeSeconds: 18000,
					},
					{
						topic: 'wetter/act-wind-speed',
						suffix: 'km/h',
						decimals: 0,
						sortOrder: 40,            // sortOrder 40 has to contain the wind speed
						maxAgeSeconds: 18000,
					},
					{
						topic: 'wetter/act-wind-dir',
						suffix: '°',
						decimals: 0,
						sortOrder: 50,            // sortOrder 50 has to contain the wind direction
						maxAgeSeconds: 18000,
					},
					{
						topic: 'wetter/raining',
						suffix: '',
						decimals: 0,
						sortOrder: 60,            // sortOrder 60 has to contain the boolean if its just raining
						maxAgeSeconds: 18000,
						conversions: [
							{ from: "true", to: "ja" },
							{ from: "false", to: "nein" }
						]
					},
					{
						topic: 'wetter/rain-today',
						suffix: '',
						decimals: 1,
						sortOrder: 70,            // sortOrder 70 has to contain the amount of rain today
						maxAgeSeconds: 18000,
					},
					{
						topic: 'wetter/max-temp',
						label: 'Temperatur max',
						suffix: '',
						decimals: 0,
						sortOrder: 80,
						maxAgeSeconds: 180000,
					},
					{
						topic: 'wetter/min-temp',
						label: 'Temperatur min',
						suffix: '',
						decimals: 0,
						sortOrder: 90,
						maxAgeSeconds: 180000,
					},
				]
			}
        ],
	}
},
```

## Configuration options

<table width="100%">
    <thead>
        <tr>
            <th>Option</th>
            <th width="100%">Description</th>
        </tr>
        <thead>
        <tbody>
            <tr>
                <td><code>address</code></td>
                <td>IP address of the MQTT Broker
                </td>
            </tr>
            <tr>
                <td><code>port</code></td>
                <td>Port of MQTT Broker
                </td>
            </tr>
            <tr>
                <td><code>user</code></td>
                <td>User to access the MQTT Broker (optional)
                </td>
            </tr>
            <tr>
                <td><code>password</code></td>
                <td>Password of user to access the MQTT Broker (optional)
                </td>
            </tr>
        </tbody>
</table>

## Value sources

Every displayed value names the sources to try, in order. The first source that
currently has a usable value wins; a source whose last reading is older than its
`maxAgeSeconds` counts as unavailable, so a dead broker or an unreachable Home
Assistant makes the mirror fall through to the next source instead of showing a
frozen number.

| Source | Where the value comes from |
|---|---|
| `mqtt` | The MQTT subscriptions configured in `mqttServers`, i.e. the local sensors. |
| `hass` | Home Assistant REST API. Shows the same numbers Home Assistant does. |
| `metno` | MET Norway (yr.no) — the API behind Home Assistant's met.no integration. |
| `owm` | OpenWeatherMap, fetched with every update. Never expires, so it is the safe last entry. |

```js
sources: {
    temperature:   ["mqtt", "owm"],            // local sensor first
    humidity:      ["mqtt", "owm"],
    windSpeed:     ["hass", "metno", "owm"],   // no wind sensor here
    windDirection: ["hass", "metno", "owm"],
    sunrise:       ["hass", "owm"],
    sunset:        ["hass", "owm"],
},
```

Leaving `sources` out keeps the previous behaviour: MQTT first, OpenWeatherMap
as the fallback.

Wind speeds are normalised to meters per second before `useBeaufort` /
`useKMPHwind` turn them into the displayed unit, so every source may report in
its own unit. `mqttWindSpeedUnit` (default `kmh`) declares what the MQTT topic
publishes; Home Assistant entities declare theirs per entity. This also fixes an
older inconsistency: with `useBeaufort` the MQTT wind speed used to be read as
m/s while the other display modes treated it as km/h.

Values that did not come from a local sensor are printed in yellow, as before.

### `metno`

```js
metno: {
    lat: 50.669907,
    lon: 17.9010475,
    userAgent: "MagicMirror/2.31 (you@example.com)",  // required, see below
    updateInterval: 15 * 60 * 1000,
    maxAgeSeconds: 3600,
},
```

The met.no terms of service require an identifying `User-Agent` carrying a
contact address; requests without one are rejected. Browsers refuse to let a
page set that header, so this source is fetched in `node_helper.js`, which also
sends `If-Modified-Since` as the terms ask. Without `userAgent` the source stays
disabled and logs a warning.

### `hass`

```js
hass: {
    host: "homeassistant.local",
    port: 8123,
    useTLS: false,
    token: "",                       // long-lived access token
    updateInterval: 5 * 60 * 1000,
    maxAgeSeconds: 1800,
    entities: {
        windSpeed:     { entity: "weather.forecast_home", attribute: "wind_speed", unit: "kmh" },
        windDirection: { entity: "weather.forecast_home", attribute: "wind_bearing" },
        sunrise:       { entity: "sensor.home_sun_rising" },
        sunset:        { entity: "sensor.home_sun_setting" },
    },
},
```

Each entry reads one entity attribute, or the entity state when `attribute` is
omitted. Entities reporting `unavailable` or `unknown` are skipped. Without a
`token` or with an empty `entities` map the source stays disabled.

Entities holding a timestamp, such as the Sun2 rising and setting sensors, are
parsed from ISO 8601 into epoch milliseconds, which is what `sunrise` and
`sunset` expect. Use the sensors holding *today's* times, not the `next_*` ones:
the module decides on its own whether to display the sunrise or the sunset.
