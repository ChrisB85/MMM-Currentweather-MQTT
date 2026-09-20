/* Magic Mirror
 * Module: MMM-Currentweather-MQTT
 *
 * Source resolution. Every weather value names the sources to try, in order;
 * the first source that currently has a usable value wins.
 *
 * Loaded both by the module (browser) and by weathersources.test.js (node).
 *
 * MIT Licensed.
 */

(function (root) {
	"use strict";

	// Factors turning a wind speed into meters per second.
	var WIND_SPEED_TO_MS = {
		ms: 1,
		kmh: 1 / 3.6,
		mph: 0.44704,
		kn: 0.514444
	};

	function toMetersPerSecond(value, unit) {
		var factor = WIND_SPEED_TO_MS[unit || "ms"];
		if (typeof factor === "undefined") {
			throw new Error("Unknown wind speed unit: " + unit);
		}
		return parseFloat(value) * factor;
	}

	function hasValue(candidate) {
		if (!candidate) {
			return false;
		}
		if (candidate.value === null || typeof candidate.value === "undefined" || candidate.value === "") {
			return false;
		}
		return !isNaN(parseFloat(candidate.value));
	}

	/* A source stays available only while its last reading is recent enough.
	 * A dead MQTT broker or an unreachable Home Assistant keeps its last value
	 * in memory forever, so without this check the mirror would show a frozen
	 * number instead of falling through to the next source.
	 *
	 * maxAgeSeconds 0 or undefined disables the check. That is what values
	 * fetched as part of the current request use (OpenWeatherMap).
	 */
	function isExpired(candidate, now) {
		if (!candidate.maxAgeSeconds) {
			return false;
		}
		return candidate.time + candidate.maxAgeSeconds * 1000 < now;
	}

	/* priority   - array of source names, most wanted first
	 * candidates - map source name -> { value, time, maxAgeSeconds, unit }
	 * returns    - { source, value, unit } or null when no source has a value
	 */
	function resolve(priority, candidates, now) {
		now = typeof now === "undefined" ? Date.now() : now;

		for (var i = 0; i < (priority || []).length; i++) {
			var name = priority[i];
			var candidate = candidates[name];
			if (hasValue(candidate) && !isExpired(candidate, now)) {
				return {
					source: name,
					value: parseFloat(candidate.value),
					unit: candidate.unit
				};
			}
		}

		return null;
	}

	var api = {
		resolve: resolve,
		toMetersPerSecond: toMetersPerSecond,
		WIND_SPEED_TO_MS: WIND_SPEED_TO_MS
	};

	if (typeof module !== "undefined" && module.exports) {
		module.exports = api;
	} else {
		root.WeatherSources = api;
	}
})(this);
