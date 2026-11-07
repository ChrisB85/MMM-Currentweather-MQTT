/* Which extra values go above and which below the temperature.
 * Pure, so node can check it: node layout.test.js
 */
(function (root) {
	"use strict";

	var ROWS = ["above", "below"];

	/*
	 * rows:  { above: [names], below: [names] } from the module config.
	 * known: names the module can render.
	 * Returns the rows with only known names, each name once (first row wins),
	 * plus what was dropped, so the module can log it instead of failing.
	 */
	function resolveRows(rows, known) {
		var result = { above: [], below: [], unknown: [], duplicates: [] };
		var seen = {};

		ROWS.forEach(function (row) {
			var names = (rows && Array.isArray(rows[row])) ? rows[row] : [];
			names.forEach(function (name) {
				if (known.indexOf(name) === -1) {
					result.unknown.push(name);
				} else if (seen[name]) {
					result.duplicates.push(name);
				} else {
					seen[name] = true;
					result[row].push(name);
				}
			});
		});

		return result;
	}

	var api = { resolveRows: resolveRows };

	if (typeof module !== "undefined" && module.exports) {
		module.exports = api;
	} else {
		root.WeatherLayout = api;
	}
})(this);
