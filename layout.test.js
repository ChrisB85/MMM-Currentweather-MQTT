/* Self-check for the row layout: node layout.test.js */

const assert = require("assert");
const { resolveRows } = require("./layout.js");

const KNOWN = ["wind", "humidity", "pressure", "uvIndex", "airQuality", "sunriseSunset"];

// Names keep their configured row and order.
assert.deepStrictEqual(
	resolveRows({ above: ["airQuality", "wind"], below: ["sunriseSunset", "uvIndex"] }, KNOWN),
	{ above: ["airQuality", "wind"], below: ["sunriseSunset", "uvIndex"], unknown: [], duplicates: [] }
);

// A typo is dropped and reported, the rest still shows.
assert.deepStrictEqual(
	resolveRows({ above: ["wnd", "wind"], below: [] }, KNOWN),
	{ above: ["wind"], below: [], unknown: ["wnd"], duplicates: [] }
);

// A name in both rows shows once, in the first row.
assert.deepStrictEqual(
	resolveRows({ above: ["wind"], below: ["wind", "uvIndex"] }, KNOWN),
	{ above: ["wind"], below: ["uvIndex"], unknown: [], duplicates: ["wind"] }
);

// A missing row is empty, a missing config shows nothing.
assert.deepStrictEqual(resolveRows({ below: ["uvIndex"] }, KNOWN).above, []);
assert.deepStrictEqual(resolveRows(undefined, KNOWN), { above: [], below: [], unknown: [], duplicates: [] });

console.log("layout: all checks passed");
