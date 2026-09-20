/* Self-check for the source resolver: node weathersources.test.js */

const assert = require("assert");
const { resolve, toMetersPerSecond } = require("./weathersources.js");

const NOW = 1_000_000_000_000;
const fresh = (value, unit) => ({ value, time: NOW - 60_000, maxAgeSeconds: 1800, unit });
const stale = (value) => ({ value, time: NOW - 7_200_000, maxAgeSeconds: 1800 });
const always = (value, unit) => ({ value, time: NOW, maxAgeSeconds: 0, unit });

// Priority decides: Home Assistant first, even though every source has a value.
assert.deepStrictEqual(
	resolve(["hass", "metno", "owm"], { hass: fresh(12), metno: fresh(9), owm: always(5) }, NOW),
	{ source: "hass", value: 12, unit: undefined }
);

// Home Assistant unreachable: its last value ages out, the next source takes over.
assert.strictEqual(
	resolve(["hass", "metno", "owm"], { hass: stale(12), metno: fresh(9), owm: always(5) }, NOW).source,
	"metno"
);

// A source that never delivered is skipped, an empty MQTT payload counts as no value.
assert.strictEqual(
	resolve(["hass", "mqtt", "owm"], { mqtt: fresh(""), owm: always(5) }, NOW).source,
	"owm"
);

// OpenWeatherMap is fetched with the current request, so it never expires.
assert.strictEqual(resolve(["owm"], { owm: { value: 5, time: 0, maxAgeSeconds: 0 } }, NOW).source, "owm");

// Nothing usable at all.
assert.strictEqual(resolve(["hass", "metno"], { hass: stale(12) }, NOW), null);

// Unit stays with the value so the caller can normalise it.
assert.deepStrictEqual(resolve(["mqtt"], { mqtt: fresh("18", "kmh") }, NOW), { source: "mqtt", value: 18, unit: "kmh" });
assert.strictEqual(toMetersPerSecond(18, "kmh"), 5);
assert.strictEqual(toMetersPerSecond(5, "ms"), 5);
assert.strictEqual(toMetersPerSecond(5, undefined), 5);
assert.throws(() => toMetersPerSecond(5, "furlongs"), /Unknown wind speed unit/);

console.log("weathersources: all checks passed");

// --- the module wiring: candidate building and unit normalisation ----------

global.config = { units: "metric", timeFormat: 24, language: "pl" };
global.Log = { info: () => {}, error: () => {}, log: () => {} };
global.WeatherSources = require("./weathersources.js");

let definition;
global.Module = { register: (name, def) => { definition = def; } };
require("./MMM-Currentweather-MQTT.js");

const owmData = {
	main: { temp: 12, humidity: 80 },
	wind: { speed: 5, deg: 180 },
	sys: { sunrise: 1789529457, sunset: 1789573957 }   // epoch seconds, as OpenWeatherMap sends them
};

function mirror(overrides) {
	const module = Object.create(definition);
	module.config = JSON.parse(JSON.stringify(definition.defaults));
	module.log = () => {};
	module.externalValues = {};
	module.subscriptions = [];
	for (let i = 0; i < 9; i++) {
		module.subscriptions.push({ value: "", time: Date.now(), maxAgeSeconds: 18000 });
	}
	Object.assign(module, overrides);
	return module;
}

// MQTT publishes km/h, the mirror normalises to m/s before display.
const withSensor = mirror();
withSensor.subscriptions[withSensor.indexWindSpeed] = { value: "18", time: Date.now(), maxAgeSeconds: 18000 };
const sensorWind = withSensor.pickValue("windSpeed", owmData);
assert.strictEqual(sensorWind.source, "mqtt");
assert.strictEqual(WeatherSources.toMetersPerSecond(sensorWind.value, sensorWind.unit), 5);

// Sensor silent for six hours: OpenWeatherMap takes over, already in m/s.
const staleSensor = mirror();
staleSensor.subscriptions[staleSensor.indexWindSpeed] = { value: "18", time: Date.now() - 6 * 3600 * 1000, maxAgeSeconds: 18000 };
const owmWind = staleSensor.pickValue("windSpeed", owmData);
assert.strictEqual(owmWind.source, "owm");
assert.strictEqual(WeatherSources.toMetersPerSecond(owmWind.value, owmWind.unit), 5);

// Home Assistant first, met.no as its stand-in - the wind config we ship.
const hassFirst = mirror();
hassFirst.config.sources.windSpeed = ["hass", "metno", "owm"];
hassFirst.externalValues.hass = { time: Date.now(), values: { windSpeed: 21.6 }, units: { windSpeed: "kmh" } };
hassFirst.externalValues.metno = { time: Date.now(), values: { windSpeed: 4.3 }, units: { windSpeed: "ms" } };
const hassWind = hassFirst.pickValue("windSpeed", owmData);
assert.strictEqual(hassWind.source, "hass");
assert.strictEqual(WeatherSources.toMetersPerSecond(hassWind.value, hassWind.unit).toFixed(3), "6.000");

// Home Assistant unreachable: its last value ages out, met.no steps in.
hassFirst.externalValues.hass.time = Date.now() - 2 * 3600 * 1000;
assert.strictEqual(hassFirst.pickValue("windSpeed", owmData).source, "metno");

// A source list naming only dead sources still shows OpenWeatherMap.
const nothingLeft = mirror();
nothingLeft.config.sources.windSpeed = ["hass"];
assert.strictEqual(nothingLeft.pickValue("windSpeed", owmData).source, "owm");

// The balcony sensor keeps the temperature, whatever the wind does.
const temp = mirror();
temp.subscriptions[temp.indexTemp] = { value: "8.4", time: Date.now(), maxAgeSeconds: 18000 };
temp.externalValues.hass = { time: Date.now(), values: { temperature: 11.2 } };
assert.deepStrictEqual(temp.pickValue("temperature", owmData), { source: "mqtt", value: 8.4, unit: undefined });

// Sun times: OpenWeatherMap sends epoch seconds, Home Assistant epoch
// milliseconds (node_helper parses the ISO timestamp), both end up in ms.
const sun = mirror();
assert.deepStrictEqual(
	new Date(sun.pickValue("sunrise", owmData).value).toISOString(),
	new Date(owmData.sys.sunrise * 1000).toISOString()
);

sun.config.sources.sunrise = ["hass", "owm"];
sun.config.sources.sunset = ["hass", "owm"];
sun.externalValues.hass = { time: Date.now(), values: { sunrise: Date.parse("2026-09-20T04:29:08+00:00") } };
const hassSunrise = sun.pickValue("sunrise", owmData);
assert.strictEqual(hassSunrise.source, "hass");
assert.strictEqual(new Date(hassSunrise.value).toISOString(), "2026-09-20T04:29:08.000Z");

// Sunset was not among the Home Assistant entities, so it stays on OpenWeatherMap.
assert.strictEqual(sun.pickValue("sunset", owmData).source, "owm");

console.log("module wiring: all checks passed");
