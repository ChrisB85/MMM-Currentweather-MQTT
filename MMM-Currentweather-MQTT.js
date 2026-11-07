/* Magic Mirror
 * Module: MMM-CurrentWeather-MQTT
 *
 * based on standard module currentweather by Michael Teeuw http://michaelteeuw.nl
 * based on MMM-MQTT by ottopaulsen
 * 
 * MIT Licensed.
 */

Module.register("MMM-Currentweather-MQTT",{

	// Default module config.
	defaults: {
		logging: false,
		location: false,
		locationID: false,
		appid: "",
		units: config.units,
		updateInterval: 10 * 60 * 1000, // every 10 minutes
		animationSpeed: 1000,
		timeFormat: config.timeFormat,
		showPeriod: true,
		showPeriodUpper: false,
		showWindDirection: true,
		showWindDirectionAsArrow: false,
		useBeaufort: true,
		appendLocationNameToHeader: false,
		useKMPHwind: false,
		lang: config.language,
		decimalSymbol: ".",
		showHumidity: false,
		showPressure: false,
		showUVIndex: false,
		showAirQuality: false,
		airQualityLabel: "CAQI",
		degreeLabel: false,
		showIndoorTemperature: false,
		showIndoorHumidity: false,
		showFeelsLike: false,
		showRainfall: false,
		showTempMax: false,
		showTempMin: false,
		// Colour scales, keyed like sources (temperature, humidity, windSpeed,
		// pressure, uvIndex, airQuality): [{ at: 0, color: "#2d8fe0" }, ...]
		// in display units; the colour flows between stops. None by default.
		scales: {},
		// Extra values in the row above and the row below the temperature, in
		// this order. Names: wind, humidity, pressure, uvIndex, airQuality,
		// sunriseSunset. The show* switches still turn each one on or off.
		extraRows: {
			above: ["wind", "humidity", "pressure", "uvIndex", "airQuality", "sunriseSunset"],
			below: []
		},

		initialLoadDelay: 0, // 0 seconds delay
		retryDelay: 2500,

		apiVersion: "2.5",
		apiBase: "https://api.openweathermap.org/data/",
		weatherEndpoint: "weather",

		appendLocationNameToHeader: true,
		calendarClass: "calendar",

		onlyTemp: false,
		roundTemp: false,

		iconTable: {
			"01d": "wi-day-sunny",
			"02d": "wi-day-cloudy",
			"03d": "wi-cloudy",
			"04d": "wi-cloudy-windy",
			"09d": "wi-showers",
			"10d": "wi-rain",
			"11d": "wi-thunderstorm",
			"13d": "wi-snow",
			"50d": "wi-fog",
			"01n": "wi-night-clear",
			"02n": "wi-night-cloudy",
			"03n": "wi-night-cloudy",
			"04n": "wi-night-cloudy",
			"09n": "wi-night-showers",
			"10n": "wi-night-rain",
			"11n": "wi-night-thunderstorm",
			"13n": "wi-night-snow",
			"50n": "wi-night-alt-cloudy-windy"
		},

		mqttServers: [],

		// Where every value comes from. The sources are tried in the order
		// listed; the first one that currently has a usable value wins.
		// Known sources: "mqtt", "hass", "metno", "owm".
		sources: {
			temperature: ["mqtt", "owm"],
			humidity: ["mqtt", "owm"],
			windSpeed: ["mqtt", "owm"],
			windDirection: ["mqtt", "owm"],
			pressure: ["hass", "owm"],
			sunrise: ["owm"],
			sunset: ["owm"],
			// OpenWeatherMap's current weather has no UV index, so there is no
			// fallback: without a source the UV index is left out.
			uvIndex: ["metno"],
			// No built-in source carries an air quality index; configure one
			// (e.g. "hass" with an airQuality entity) to show it.
			airQuality: []
		},

		// Unit the MQTT wind speed topic publishes in: "kmh", "ms", "mph" or "kn".
		mqttWindSpeedUnit: "kmh",

		// Height of the local pressure sensor above sea level, in meters. Local
		// sensors read station pressure, weather services report it reduced to sea
		// level; this reduces the local reading to the same scale. 0 shows it raw.
		pressureAltitude: 0,

		// MET Norway (yr.no) - the API behind Home Assistant's met.no integration.
		metno: {
			lat: null,
			lon: null,
			userAgent: "",                  // required by the met.no terms of service, must carry a contact address
			updateInterval: 15 * 60 * 1000,
			maxAgeSeconds: 3600
		},

		// Home Assistant REST API. Fetching from Home Assistant keeps the mirror
		// showing the same numbers Home Assistant does.
		hass: {
			host: "",
			port: 8123,
			useTLS: true,
			token: "",                      // long-lived access token
			updateInterval: 5 * 60 * 1000,
			maxAgeSeconds: 1800,
			// value key -> { entity, attribute, unit }
			// attribute omitted reads the entity state instead of an attribute
			entities: {}
		},

	},

	// Indizes für den Zugriff auf die subscriptions
	indexTemp: 0,
	indexHum: 1,
	indexIllum: 2,
	indexWindSpeed: 3,
	indexWindDir: 4,
	indexRaining: 5,
	indexRainfall: 6,
	indexTempMax: 7,
	indexTempMin: 8,

	// Name of the source each displayed value came from, see config.sources.
	sourceHum: "owm",
	sourceTemp: "owm",
	sourceWindSpeed: "owm",
	sourceWindDir: "owm",
	sourcePressure: "owm",
	sourceRaining: "owm",
	sourceRainfall: "owm",
	sourceTempMax: "mqtt",
	sourceTempMin: "mqtt",
	sourceSunrise: "owm",
	sourceSunset: "owm",



	// store HTTRequestResponse
	HTTPRequestResponse: "",

	// create a variable for the first upcoming calendar event. Used if no location is specified.
	firstEvent: false,

	// create a variable to hold the location name based on the API result.
	fetchedLocationName: "",

	// logging function controlled by config variable
	log: function(...args) {
		if (this.config.logging) {
			console.log(args);
		}
	},
	
	// Define required scripts.
	getScripts: function() {
		return ["moment.js", "modules/MMM-Currentweather-MQTT/weathersources.js", "modules/MMM-Currentweather-MQTT/layout.js"];
	},

	// Define required scripts.
	getStyles: function() {
		return ["MMM-Currentweather-MQTT.css"];
	},

	// Define required translations.
	getTranslations: function () {
		return {
			en: "translations/en.json",
			de: "translations/de.json"
		}
	},

	// Define start sequence.
	start: function() {
		Log.info("Starting module: " + this.name);

		this.subscriptions = [];

		// Module config is merged with the defaults one level deep only, so a
		// config setting just metno.lat would drop the other metno defaults.
		this.config.sources = Object.assign({}, this.defaults.sources, this.config.sources);
		this.config.metno = Object.assign({}, this.defaults.metno, this.config.metno);
		this.config.hass = Object.assign({}, this.defaults.hass, this.config.hass);

		// Readings pushed by node_helper, keyed by source name.
		this.externalValues = {};

		Log.info(this.name + ": Setting up connection to " + this.config.mqttServers.length + " servers");
	
		for (i = 0; i < this.config.mqttServers.length; i++) {
			var s = this.config.mqttServers[i];
			var serverKey = this.makeServerKey(s);
			Log.info(
				this.name +
				": Adding config for " +
				s.address +
				" port " +
				s.port +
				" user " +
				s.user
			);

			for (j = 0; j < s.subscriptions.length; j++) {
				var sub = s.subscriptions[j];
				this.subscriptions.push({
					serverKey: serverKey,
					label: sub.label,
					topic: sub.topic,
					decimals: sub.decimals,
					suffix: typeof sub.suffix == "undefined" ? "" : sub.suffix,
					value: "",
					time: Date.now(),
					maxAgeSeconds: sub.maxAgeSeconds,
					sortOrder: sub.sortOrder || i * 100 + j,
					colors: sub.colors,
					conversions: sub.conversions,
					multiply: sub.multiply,
					divide: sub.divide
				});
				Log.info(
					this.name + ": subscription for " + sub.topic);
			}
		}
	
		this.openMqttConnection();
	
		// Set locale.
		moment.locale(config.language);

		this.windSpeed = null;
		this.windDirection = null;
		this.windDeg = null;
		this.sunriseSunsetTime = null;
		this.sunriseSunsetIcon = null;
		this.temperature = null;
		this.pressure = null;
		this.uvIndex = null;
		this.airQuality = null;
		this.indoorTemperature = null;
		this.indoorHumidity = null;
		this.weatherType = null;
		this.feelsLike = null;
		this.rainfall = null;
		this.raining = false;
		this.loaded = false;
		this.scheduleUpdate(this.config.initialLoadDelay);

	},

	openMqttConnection: function() {
		this.sendSocketNotification("MQTT_CONFIG", this.config);
		this.sendSocketNotification("WEATHER_SOURCE_CONFIG", {
			metno: this.config.metno,
			hass: this.config.hass,
			logging: this.config.logging
		});
	},
		
	// How a value looks: "value" always (the theme can make values neutral and
	// leave icons and labels in the module colour) and its colour from
	// config.scales; "remote" marks a coloured value not from a local sensor,
	// an uncoloured one stays "yellow", as before scales existed.
	valueLook: function(key, value, remote) {
		var color = WeatherSources.colourFor(value, (this.config.scales || {})[key]);
		var className = "value";
		if (color) {
			className += remote ? " remote" : "";
		} else if (remote) {
			className += " yellow";
		}
		return { className: className, color: color };
	},

	// Gives element the look of a value next to its own classes. The colour
	// goes inline and important, the theme's .value rule is important too.
	paintValue: function(element, baseClass, key, value, remote) {
		var look = this.valueLook(key, value, remote);
		element.className = (baseClass + " " + look.className).trim();
		if (look.color) {
			element.style.setProperty("color", look.color, "important");
		}
		return look;
	},

	// Extra values around the temperature. config.extraRows says which go in
	// the row above it and which in the row below; each renderer returns the
	// elements to show, or null when its value is off or missing.
	extraRenderers: {
		wind: function() {
			var remote = this.isRemoteSource(this.sourceWindDir);
			var elements = [];

			var windIcon = document.createElement("span");
			windIcon.className = "wi wi-strong-wind dimmed" + (remote ? " yellow" : "");
			elements.push(windIcon);

			var spacer = document.createElement("sup");
			spacer.innerHTML = "&nbsp;&nbsp;&nbsp;&nbsp;";
			elements.push(spacer);

			var windSpeed = document.createElement("span");
			this.paintValue(windSpeed, "", "windSpeed", this.windSpeed, this.isRemoteSource(this.sourceWindSpeed));
			windSpeed.innerHTML = " " + this.windSpeed;
			elements.push(windSpeed);

			if (this.config.showWindDirection) {
				var windDirection = document.createElement("sup");
				windDirection.className = "unit" + (remote ? " yellow" : "");
				if (this.config.showWindDirectionAsArrow) {
					if (this.windDeg !== null) {
						windDirection.innerHTML = "<i class=\"fa fa-long-arrow-down\" style=\"transform:rotate(" + this.windDeg + "deg);\"></i>";
					}
				} else {
					windDirection.innerHTML = " " + this.translate(this.windDirection);
				}
				elements.push(windDirection);
			}
			return elements;
		},

		humidity: function() {
			if (!this.config.showHumidity) {
				return null;
			}
			var remote = this.isRemoteSource(this.sourceHum);

			// Icon before the value and the unit raised after it, the way
			// pressure shows its barometer and hPa.
			var humidityIcon = document.createElement("span");
			humidityIcon.className = "wi wi-raindrop dimmed" + (remote ? " yellow" : "");

			var humidity = document.createElement("span");
			this.paintValue(humidity, "", "humidity", this.humidity, remote);
			humidity.innerHTML = " " + this.humidity;

			var humidityUnit = document.createElement("sup");
			humidityUnit.className = "unit unit-text" + (remote ? " yellow" : "");
			humidityUnit.innerHTML = "%";

			return [humidityIcon, humidity, humidityUnit];
		},

		pressure: function() {
			if (!this.config.showPressure || this.pressure === null) {
				return null;
			}
			var remote = this.isStationPressure(this.sourcePressure) === false;

			var pressureIcon = document.createElement("span");
			pressureIcon.className = "wi wi-barometer dimmed";

			var pressure = document.createElement("span");
			this.paintValue(pressure, "", "pressure", this.pressure, remote);
			pressure.innerHTML = " " + this.pressure;

			// The unit rides raised and small, the way the humidity sign does.
			var pressureUnit = document.createElement("sup");
			pressureUnit.className = "unit unit-text" + (remote ? " yellow" : "");
			pressureUnit.innerHTML = "hPa";

			return [pressureIcon, pressure, pressureUnit];
		},

		uvIndex: function() {
			if (!this.config.showUVIndex || this.uvIndex === null) {
				return null;
			}
			// Text labels keep the plain colour, like the hPa unit: dimmed thin text
			// reads darker than the dimmed icon glyphs next to it.
			// No local UV sensor exists, so the value is always a remote one.
			var uvLabel = document.createElement("span");
			uvLabel.innerHTML = "UV";

			var uvIndex = document.createElement("span");
			this.paintValue(uvIndex, "", "uvIndex", this.uvIndex, true);
			uvIndex.innerHTML = " " + this.uvIndex;

			return [uvLabel, uvIndex];
		},

		airQuality: function() {
			if (!this.config.showAirQuality || this.airQuality === null) {
				return null;
			}
			var airQualityLabel = document.createElement("span");
			airQualityLabel.textContent = this.config.airQualityLabel;

			// The colour comes from scales.airQuality when configured, else from
			// the level the source reports: custom.css styles the
			// air-quality-<level> classes. The source never colours it.
			var airQuality = document.createElement("span");
			var look = this.paintValue(airQuality, "air-quality", "airQuality", this.airQuality.value, false);
			if (!look.color && this.airQuality.levelClass) {
				airQuality.className += " " + this.airQuality.levelClass;
			}
			airQuality.textContent = " " + this.airQuality.value;

			return [airQualityLabel, airQuality];
		},

		sunriseSunset: function() {
			var sunriseSunsetIcon = document.createElement("span");
			sunriseSunsetIcon.className = "wi dimmed " + this.sunriseSunsetIcon;

			var sunriseSunsetTime = document.createElement("span");
			sunriseSunsetTime.className = "value";
			sunriseSunsetTime.innerHTML = " " + this.sunriseSunsetTime;

			return [sunriseSunsetIcon, sunriseSunsetTime];
		}
	},

	// Config rows checked once; unknown or repeated names are logged and skipped.
	extraRows: function() {
		if (!this.resolvedExtraRows) {
			var rows = WeatherLayout.resolveRows(this.config.extraRows, Object.keys(this.extraRenderers));
			if (rows.unknown.length > 0) {
				Log.warn(this.name + ": unknown extraRows names skipped: " + rows.unknown.join(", ") + "; known: " + Object.keys(this.extraRenderers).join(", "));
			}
			if (rows.duplicates.length > 0) {
				Log.warn(this.name + ": extraRows names listed twice, shown once: " + rows.duplicates.join(", "));
			}
			this.resolvedExtraRows = rows;
		}
		return this.resolvedExtraRows;
	},

	// One line of extra values, each in its own .extra-item so the theme sets
	// the gap between them (--extra-gap) and, by the row class extra-<row>,
	// the gap to the temperature (--extra-row-gap); see the module CSS.
	addExtraRow: function(wrapper, row) {
		var names = this.extraRows()[row];
		var small = document.createElement("div");
		small.className = "normal medium extra-row extra-" + row;

		var self = this;
		names.forEach(function(name) {
			var elements = self.extraRenderers[name].call(self);
			if (!elements) {
				return;
			}
			var item = document.createElement("span");
			item.className = "extra-item extra-" + name;
			elements.forEach(function(element) {
				item.appendChild(element);
			});
			small.appendChild(item);
		});

		if (small.childNodes.length > 0) {
			wrapper.appendChild(small);
		}
	},

	// Override dom generator.
	getDom: function() {
		var wrapper = document.createElement("div");

		if (this.config.appid === "") {
			wrapper.innerHTML = "Please set the correct openweather <i>appid</i> in the config for module: " + this.name + ".";
			wrapper.className = "dimmed light small";
			return wrapper;
		}

		if (!this.loaded) {
			wrapper.innerHTML = this.translate("LOADING");
			wrapper.className = "dimmed light small";
			return wrapper;
		}

		if (this.config.onlyTemp === false) {
			this.addExtraRow(wrapper, "above");
		}

		var spacer1 = document.createElement("sup");
		spacer1.innerHTML = "&nbsp;";

		var spacer2 = document.createElement("sup");
		spacer2.innerHTML = "&nbsp;&nbsp;";

		var spacer3 = document.createElement("sup");
		spacer3.innerHTML = "&nbsp;&nbsp;&nbsp;";

		var spacer4 = document.createElement("sup");
		spacer4.innerHTML = "&nbsp;&nbsp;&nbsp;&nbsp;";

		var large = document.createElement("div");
		large.className = "large light";

		if (this.config.showRainfall) {
			var rainfallToday = document.createElement("span");
			rainfallToday.className = "normal medium";
			if (this.isRemoteSource(this.sourceRainfall)) {
				rainfallToday.className = rainfallToday.className + " yellow";
			}
			if (this.raining === "true") {
				rainfallToday.className = rainfallToday.className + " blue";
			}
			rainfallToday.innerHTML = this.rainfall + " l/m²";

			var spacer = document.createElement("sup");
			spacer.innerHTML = "&nbsp;&nbsp;&nbsp;&nbsp;";

			large.appendChild(rainfallToday);
			large.appendChild(spacer);
		}



		var weatherIcon = document.createElement("span");
		weatherIcon.className = "wi weathericon " + this.weatherType;
		large.appendChild(weatherIcon);

		var degreeLabel = "";
		if (this.config.units === "metric" || this.config.units === "imperial") {
			degreeLabel += "°";
		}
		if(this.config.degreeLabel) {
			switch(this.config.units) {
			case "metric":
				degreeLabel += "C";
				break;
			case "imperial":
				degreeLabel += "F";
				break;
			case "default":
				degreeLabel += "K";
				break;
			}
		}

		if (this.config.decimalSymbol === "") {
			this.config.decimalSymbol = ".";
		}

		var temperature = document.createElement("span");
		this.paintValue(temperature, "bright", "temperature", this.temperature, this.isRemoteSource(this.sourceTemp));

		temperature.innerHTML = " " + this.temperature.replace(".", this.config.decimalSymbol) + degreeLabel;
		large.appendChild(temperature);

		if (this.config.showIndoorTemperature && this.indoorTemperature) {
			var indoorIcon = document.createElement("span");
			indoorIcon.className = "fa fa-home";
			large.appendChild(indoorIcon);

			var indoorTemperatureElem = document.createElement("span");
			indoorTemperatureElem.className = "bright";
			indoorTemperatureElem.innerHTML = " " + this.indoorTemperature.replace(".", this.config.decimalSymbol) + degreeLabel;
			large.appendChild(indoorTemperatureElem);
		}

		if (this.config.showIndoorHumidity && this.indoorHumidity) {
			var indoorHumidityIcon = document.createElement("span");
			indoorHumidityIcon.className = "fa fa-tint";
			large.appendChild(indoorHumidityIcon);

			var indoorHumidityElem = document.createElement("span");
			indoorHumidityElem.className = "bright";
			indoorHumidityElem.innerHTML = " " + this.indoorHumidity + "%";
			large.appendChild(indoorHumidityElem);
		}

		wrapper.appendChild(large);

		if (this.config.onlyTemp === false) {
			this.addExtraRow(wrapper, "below");
		}

		if (this.config.showFeelsLike && this.config.onlyTemp === false){
			var small = document.createElement("div");
			small.className = "normal medium";

			var feelsLike = document.createElement("span");
			this.paintValue(feelsLike, "dimmed", "temperature", this.feelsLike, false);
			feelsLike.innerHTML = this.translate("FEELS") + " " + this.feelsLike + degreeLabel;
			small.appendChild(feelsLike);

			wrapper.appendChild(small);
		}

		if (this.config.showTempMax || this.config.showTempMin){
			var minmax = document.createElement("div");
			minmax.className = "normal medium";

			if (this.config.showTempMin) {
				var tempMin = document.createElement("span");
				this.paintValue(tempMin, "normal medium", "temperature", this.tempMinToday, false);
				tempMin.innerHTML = "Min.: " + this.tempMinToday + " °C";
	
				var spacer = document.createElement("sup");
				spacer.innerHTML = "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;";
	
				minmax.appendChild(tempMin);
				minmax.appendChild(spacer);
			}
	

			if (this.config.showTempMax) {
				var tempMax = document.createElement("span");
				this.paintValue(tempMax, "normal medium", "temperature", this.tempMaxToday, false);
				tempMax.innerHTML = "Max.: " + this.tempMaxToday + " °C";
	
				var spacer = document.createElement("sup");
				spacer.innerHTML = "&nbsp;&nbsp;&nbsp;&nbsp;";
	
				minmax.appendChild(tempMax);
				minmax.appendChild(spacer);
			}
	
			wrapper.appendChild(minmax);
		}

		return wrapper;
	},

	// Override getHeader method.
	getHeader: function() {
		if (this.config.appendLocationNameToHeader && this.data.header !== undefined) {
			return this.data.header + " " + this.fetchedLocationName;
		}

		if (this.config.useLocationAsHeader && this.config.location !== false) {
			return this.config.location;
		}

		return this.data.header;
	},

	// Override notification handler.
	notificationReceived: function(notification, payload, sender) {
		if (notification === "DOM_OBJECTS_CREATED") {
			if (this.config.appendLocationNameToHeader) {
				this.hide(0, function() {}, {lockString: this.identifier});
			}
		}
		if (notification === "CALENDAR_EVENTS") {
			var senderClasses = sender.data.classes.toLowerCase().split(" ");
			if (senderClasses.indexOf(this.config.calendarClass.toLowerCase()) !== -1) {
				this.firstEvent = false;

				for (var e in payload) {
					var event = payload[e];
					if (event.location || event.geo) {
						this.firstEvent = event;
						//this.log("First upcoming event with location: ", event);
						break;
					}
				}
			}
		}
		if (notification === "INDOOR_TEMPERATURE") {
			this.indoorTemperature = this.roundValue(payload);
			this.updateDom(this.config.animationSpeed);
		}
		if (notification === "INDOOR_HUMIDITY") {
			this.indoorHumidity = this.roundValue(payload);
			this.updateDom(this.config.animationSpeed);
		}
	},

	/* updateWeather(compliments)
	 * Requests new data from openweather.org.
	 * Calls processWeather on succesfull response.
	 */
	updateWeather: function(isTelegram) {
		if (this.config.appid === "") {
			Log.error("CurrentWeather: APPID not set!");
			return;
		}

		// Falls Aufruf durch Eintreffen eines neuen MQTT Telegramms, dann kein neuer HTTPRequest, 
		// da ansonsten der free Account von openweathermap überlastet und gesperrt wird
		if (isTelegram) {
			var self = this;
			// Aufruf mit gespeicherten Werten
			self.log("UpdateWeather", isTelegram, self.HTTPRequestResponse);
			if (self.HTTPRequestResponse != "") {
				self.processWeather(JSON.parse(self.HTTPRequestResponse));
			}
		} else {
			var url = this.config.apiBase + this.config.apiVersion + "/" + this.config.weatherEndpoint + this.getParams();
			var self = this;
			var retry = true;

			var weatherRequest = new XMLHttpRequest();
			weatherRequest.open("GET", url, true);
			weatherRequest.onreadystatechange = function() {
				if (this.readyState === 4) {
					if (this.status === 200) {
						self.HTTPRequestResponse = this.response;
						self.log("UpdateWeather", isTelegram, this.response, self.HTTPRequestResponse)
						self.processWeather(JSON.parse(this.response));
					} else if (this.status === 401) {
						self.updateDom(self.config.animationSpeed);

						Log.error(self.name + ": Incorrect APPID.");
						retry = true;
					} else {
						self.loaded = true;
						Log.error(self.name + ": Could not load weather.");
					}

					if (retry) {
						self.scheduleUpdate((self.loaded) ? -1 : self.config.retryDelay);
					}
				}
			};
			weatherRequest.send();
		}
	},

	/* getParams(compliments)
	 * Generates an url with api parameters based on the config.
	 *
	 * return String - URL params.
	 */
	getParams: function() {
		var params = "?";
		if(this.config.locationID) {
			params += "id=" + this.config.locationID;
		} else if(this.config.location) {
			params += "q=" + this.config.location;
		} else if (this.firstEvent && this.firstEvent.geo) {
			params += "lat=" + this.firstEvent.geo.lat + "&lon=" + this.firstEvent.geo.lon;
		} else if (this.firstEvent && this.firstEvent.location) {
			params += "q=" + this.firstEvent.location;
		} else {
			this.hide(this.config.animationSpeed, function() {}, {lockString:this.identifier});
			return;
		}

		params += "&units=" + this.config.units;
		params += "&lang=" + this.config.lang;
		params += "&APPID=" + this.config.appid;

		return params;
	},

	/* processWeather(data)
	 * Uses the received data to set the various values.
	 *
	 * argument data object - Weather information received form openweather.org.
	 */
	processWeather: function(data) {

		if (!data || !data.main || typeof data.main.temp === "undefined") {
			// Did not receive usable new data.
			// Maybe this needs a better check?
			return;
		}

		sub = this.subscriptions;
		this.sourceRainfall = "owm";

		var humidity = this.pickValue("humidity", data);
		this.sourceHum = humidity.source;
		this.humidity = humidity.value;

		var temperature = this.pickValue("temperature", data);
		this.sourceTemp = temperature.source;
		this.temperature = this.roundValue(temperature.value);

		var pressure = this.pickValue("pressure", data);
		this.sourcePressure = pressure.source;
		this.pressure = Math.round(this.pressureAtSeaLevel(pressure));

		this.uvIndex = this.uvIndexValue(data);
		this.airQuality = this.airQualityValue(data);

		this.fetchedLocationName = data.name;
		this.feelsLike = 0;

		// Every source is normalised to meters per second, the display unit is
		// applied afterwards.
		var wind = this.pickValue("windSpeed", data);
		var windSpeedInMs = WeatherSources.toMetersPerSecond(wind.value, wind.unit);
		this.sourceWindSpeed = wind.source;

		if (this.config.useBeaufort){
			this.windSpeed = this.ms2Beaufort(this.roundValue(windSpeedInMs));
		} else if (this.config.useKMPHwind) {
			this.windSpeed = parseFloat(windSpeedInMs * 3.6).toFixed(0);
		} else {
			this.windSpeed = parseFloat(windSpeedInMs).toFixed(0);
		}

		// ONLY WORKS IF TEMP IN C //
		var windInMph = parseFloat(windSpeedInMs * 2.23694);

		var tempInF = 0;
		switch (this.config.units){
		case "metric": tempInF = 1.8 * this.temperature + 32;
			break;
		case "imperial": tempInF = this.temperature;
			break;
		case "default":
			var tc = this.temperature - 273.15;
			tempInF = 1.8 * tc + 32;
			break;
		}

		if (windInMph > 3 && tempInF < 50){
			// windchill
			var windChillInF = Math.round(35.74+0.6215*tempInF-35.75*Math.pow(windInMph,0.16)+0.4275*tempInF*Math.pow(windInMph,0.16));
			var windChillInC = (windChillInF - 32) * (5/9);
			// this.feelsLike = windChillInC.toFixed(0);

			switch (this.config.units){
			case "metric": this.feelsLike = windChillInC.toFixed(0);
				break;
			case "imperial": this.feelsLike = windChillInF.toFixed(0);
				break;
			case "default":
				var tc = windChillInC + 273.15;
				this.feelsLike = tc.toFixed(0);
				break;
			}

		} else if (tempInF > 80 && this.humidity > 40){
			// heat index
			var Hindex = -42.379 + 2.04901523*tempInF + 10.14333127*this.humidity
				- 0.22475541*tempInF*this.humidity - 6.83783*Math.pow(10,-3)*tempInF*tempInF
				- 5.481717*Math.pow(10,-2)*this.humidity*this.humidity
				+ 1.22874*Math.pow(10,-3)*tempInF*tempInF*this.humidity
				+ 8.5282*Math.pow(10,-4)*tempInF*this.humidity*this.humidity
				- 1.99*Math.pow(10,-6)*tempInF*tempInF*this.humidity*this.humidity;

			switch (this.config.units){
			case "metric": this.feelsLike = parseFloat((Hindex - 32) / 1.8).toFixed(0);
				break;
			case "imperial": this.feelsLike = Hindex.toFixed(0);
				break;
			case "default":
				var tc = parseFloat((Hindex - 32) / 1.8) + 273.15;
				this.feelsLike = tc.toFixed(0);
				break;
			}
		} else {
			this.feelsLike = parseFloat(this.temperature).toFixed(0);
		}

		var windDirection = this.pickValue("windDirection", data);
		this.sourceWindDir = windDirection ? windDirection.source : "owm";
		this.windDeg = windDirection ? windDirection.value : null;
		this.windDirection = this.deg2Cardinal(this.windDeg);

		if (sub[this.indexRainfall].value == "" ) {
			this.rainfall = "-";
		} else {
			this.sourceRainfall = "mqtt";
			this.rainfall = sub[this.indexRainfall].value;
		}

		if (sub[this.indexRaining].value == "" ) {
			this.raining = "false";
		} else {
			this.sourceRaining = "mqtt";
			this.raining = sub[this.indexRaining].value;
		}

		if (sub[this.indexTempMax].value == "" ) {
			this.tempMaxToday = 59;
		} else {
			this.sourceTempMax = "mqtt";
			this.tempMaxToday = sub[this.indexTempMax].value;
		}

		if (sub[this.indexTempMin].value == "" ) {
			this.tempMinToday = -59;
		} else {
			this.sourceTempMin = "mqtt";
			this.tempMinToday = sub[this.indexTempMin].value;
		}

		this.weatherType = this.config.iconTable[data.weather[0].icon];

		var now = new Date();
		var sunriseValue = this.pickValue("sunrise", data);
		var sunsetValue = this.pickValue("sunset", data);
		this.sourceSunrise = sunriseValue.source;
		this.sourceSunset = sunsetValue.source;
		var sunrise = new Date(sunriseValue.value);
		var sunset = new Date(sunsetValue.value);

		// The moment().format('h') method has a bug on the Raspberry Pi.
		// So we need to generate the timestring manually.
		// See issue: https://github.com/MichMich/MagicMirror/issues/181
		var sunriseSunsetDateObject = (sunrise < now && sunset > now) ? sunset : sunrise;
		var timeString = moment(sunriseSunsetDateObject).format("HH:mm");
		if (this.config.timeFormat !== 24) {
			//var hours = sunriseSunsetDateObject.getHours() % 12 || 12;
			if (this.config.showPeriod) {
				if (this.config.showPeriodUpper) {
					//timeString = hours + moment(sunriseSunsetDateObject).format(':mm A');
					timeString = moment(sunriseSunsetDateObject).format("h:mm A");
				} else {
					//timeString = hours + moment(sunriseSunsetDateObject).format(':mm a');
					timeString = moment(sunriseSunsetDateObject).format("h:mm a");
				}
			} else {
				//timeString = hours + moment(sunriseSunsetDateObject).format(':mm');
				timeString = moment(sunriseSunsetDateObject).format("h:mm");
			}
		}

		this.sunriseSunsetTime = timeString;
		this.sunriseSunsetIcon = (sunrise < now && sunset > now) ? "wi-sunset" : "wi-sunrise";

		this.show(this.config.animationSpeed, function() {
			Log.log('Module is shown.');
		}, {lockString:this.identifier});
		this.loaded = true;
		this.updateDom(this.config.animationSpeed);
		this.sendNotification("CURRENTWEATHER_DATA", {data: data});
	},

	/* scheduleUpdate()
	 * Schedule next update.
	 *
	 * argument delay number - Milliseconds before next update. If empty, this.config.updateInterval is used.
	 */
	scheduleUpdate: function(delay) {
		var nextLoad = this.config.updateInterval;
		if (typeof delay !== "undefined" && delay >= 0) {
			nextLoad = delay;
		}

		var self = this;
		setTimeout(function() {
			self.updateWeather(false);
		}, nextLoad);
	},

	/* ms2Beaufort(ms)
	 * Converts m2 to beaufort (windspeed).
	 *
	 * see:
	 *  http://www.spc.noaa.gov/faq/tornado/beaufort.html
	 *  https://en.wikipedia.org/wiki/Beaufort_scale#Modern_scale
	 *
	 * argument ms number - Windspeed in m/s.
	 *
	 * return number - Windspeed in beaufort.
	 */
	ms2Beaufort: function(ms) {
		var kmh = ms * 60 * 60 / 1000;
		var speeds = [1, 5, 11, 19, 28, 38, 49, 61, 74, 88, 102, 117, 1000];
		for (var beaufort in speeds) {
			var speed = speeds[beaufort];
			if (speed > kmh) {
				return beaufort;
			}
		}
		return 12;
	},

	deg2Cardinal: function(deg) {
		if (deg>11.25 && deg<=33.75){
			return "NNE";
		} else if (deg > 33.75 && deg <= 56.25) {
			return "NE";
		} else if (deg > 56.25 && deg <= 78.75) {
			return "ENE";
		} else if (deg > 78.75 && deg <= 101.25) {
			return "E";
		} else if (deg > 101.25 && deg <= 123.75) {
			return "ESE";
		} else if (deg > 123.75 && deg <= 146.25) {
			return "SE";
		} else if (deg > 146.25 && deg <= 168.75) {
			return "SSE";
		} else if (deg > 168.75 && deg <= 191.25) {
			return "S";
		} else if (deg > 191.25 && deg <= 213.75) {
			return "SSW";
		} else if (deg > 213.75 && deg <= 236.25) {
			return "SW";
		} else if (deg > 236.25 && deg <= 258.75) {
			return "WSW";
		} else if (deg > 258.75 && deg <= 281.25) {
			return "W";
		} else if (deg > 281.25 && deg <= 303.75) {
			return "WNW";
		} else if (deg > 303.75 && deg <= 326.25) {
			return "NW";
		} else if (deg > 326.25 && deg <= 348.75) {
			return "NNW";
		} else {
			return "N";
		}
	},

	/* function(temperature)
	 * Rounds a temperature to 1 decimal or integer (depending on config.roundTemp).
	 *
	 * argument temperature number - Temperature.
	 *
	 * return string - Rounded Temperature.
	 */
	roundValue: function(temperature) {
		var decimals = this.config.roundTemp ? 0 : 1;
		return parseFloat(temperature).toFixed(decimals);
	},

	makeServerKey: function(server) {
		return "" + server.address + ":" + (server.port | ("1883" + server.user));
	},

	socketNotificationReceived: function(notification, payload) {
		if (notification === "MQTT_PAYLOAD") {
			if (payload != null) {
				this.log(this.name, payload);
				for (i = 0; i < this.subscriptions.length; i++) {
					sub = this.subscriptions[i];
					if (
						sub.serverKey == payload.serverKey && this.config.useWildcards
						? topicsMatch(sub.topic, payload.topic)
						: sub.topic == payload.topic
					) {
						var value = payload.value;

						// Multiply or divide
						value = this.multiply(sub, value);
			
						// Round if decimals is configured
						if (isNaN(sub.decimals) == false) {
							if (isNaN(value) == false) {
								value = Number(value).toFixed(sub.decimals);
							}
						}
						sub.value = value;
						sub.time = payload.time;
					}
				}
				this.updateWeather(true);
			} else {
				this.log(this.name + ": MQTT_PAYLOAD - No payload");
			}
		}

		if (notification === "WEATHER_SOURCE_DATA") {
			this.log(this.name, payload);
			this.externalValues[payload.source] = payload;
			this.updateWeather(true);
		}
	},

	/* Local sensor readings are printed plain, values fetched from a weather
	 * service are marked yellow.
	 */
	isRemoteSource: function(source) {
		return source !== "mqtt";
	},

	/* Sources reading the pressure where the sensor hangs. met.no and
	 * OpenWeatherMap already report it reduced to sea level. Home Assistant is
	 * here because the entity the mirror reads is a local sensor - a weather
	 * integration entity would need pressureAltitude 0.
	 */
	isStationPressure: function(source) {
		return source === "mqtt" || source === "hass";
	},

	/* Pressure on the scale weather forecasts use, reducing a local reading. */
	pressureAtSeaLevel: function(picked) {
		if (!this.isStationPressure(picked.source)) {
			return parseFloat(picked.value);
		}
		return WeatherSources.toSeaLevel(picked.value, this.config.pressureAltitude, this.temperatureInC());
	},

	/* this.temperature follows config.units, the barometric formula needs Celsius. */
	temperatureInC: function() {
		var value = parseFloat(this.temperature);
		switch (this.config.units) {
		case "imperial":
			return (value - 32) * 5 / 9;
		case "default":
			return value - 273.15;
		default:
			return value;
		}
	},

	/* Current reading of every source for one value.
	 *
	 * returns Object - source name -> { value, time, maxAgeSeconds, unit }
	 */
	sourceCandidates: function(key, data) {
		var self = this;
		var candidates = {};

		var mqttIndex = {
			temperature: this.indexTemp,
			humidity: this.indexHum,
			windSpeed: this.indexWindSpeed,
			windDirection: this.indexWindDir
		}[key];

		var mqttSub = typeof mqttIndex === "undefined" ? null : this.subscriptions[mqttIndex];
		if (mqttSub) {
			candidates.mqtt = {
				value: mqttSub.value,
				time: mqttSub.time,
				maxAgeSeconds: mqttSub.maxAgeSeconds,
				unit: key === "windSpeed" ? this.config.mqttWindSpeedUnit : undefined
			};
		}

		var owmValue = {
			temperature: data.main.temp,
			humidity: data.main.humidity,
			windSpeed: data.wind.speed,
			windDirection: data.wind.deg,
			pressure: data.main.pressure,
			// Sun times are epoch milliseconds, whatever the source.
			sunrise: data.sys.sunrise * 1000,
			sunset: data.sys.sunset * 1000
		}[key];

		if (typeof owmValue !== "undefined") {
			// Fetched as part of the current request, so it never ages out.
			candidates.owm = {
				value: owmValue,
				time: Date.now(),
				maxAgeSeconds: 0,
				unit: key === "windSpeed" && this.config.units === "imperial" ? "mph" : "ms"
			};
		}

		["metno", "hass"].forEach(function(name) {
			var pushed = self.externalValues[name];
			if (!pushed || typeof pushed.values[key] === "undefined") {
				return;
			}
			candidates[name] = {
				value: pushed.values[key],
				time: pushed.time,
				maxAgeSeconds: self.config[name].maxAgeSeconds,
				unit: pushed.units ? pushed.units[key] : undefined
			};
		});

		return candidates;
	},

	/* Value for one key, following the configured source priority.
	 * Falls back to OpenWeatherMap when none of the configured sources has a
	 * value, so a silent sensor never blanks the display.
	 */
	pickValue: function(key, data) {
		var candidates = this.sourceCandidates(key, data);
		var picked = WeatherSources.resolve(this.config.sources[key], candidates);
		if (!picked) {
			picked = WeatherSources.resolve(["owm"], candidates);
			this.log(this.name + ": no configured source for " + key + ", using owm");
		}
		return picked;
	},

	/* UV index rounded to a whole number, the way it is reported, or null
	 * when no configured source has one. Unlike pickValue there is no
	 * OpenWeatherMap fallback: its current weather carries no UV index.
	 */
	uvIndexValue: function(data) {
		var picked = WeatherSources.resolve(this.config.sources.uvIndex, this.sourceCandidates("uvIndex", data));
		return picked ? Math.round(picked.value) : null;
	},

	/* Air quality index rounded to a whole number, with the CSS class of its
	 * level, or null when no configured source has one. The level is read from
	 * the same reading as the index (key airQualityLevel, e.g. the level
	 * attribute of Home Assistant's Airly CAQI sensor), so both age out
	 * together. No OpenWeatherMap fallback: its current weather has no index.
	 *
	 * returns { value, levelClass } - levelClass null when no level came along
	 */
	airQualityValue: function(data) {
		var picked = WeatherSources.resolve(this.config.sources.airQuality, this.sourceCandidates("airQuality", data));
		if (!picked) {
			return null;
		}
		var reading = this.externalValues[picked.source];
		var level = reading && reading.values ? reading.values.airQualityLevel : undefined;
		return {
			value: Math.round(picked.value),
			levelClass: WeatherSources.levelClass("air-quality", level)
		};
	},

	isValueTooOld: function(maxAgeSeconds, updatedTime) {
		// console.log(this.name + ': maxAgeSeconds = ', maxAgeSeconds);
		// console.log(this.name + ': updatedTime = ', updatedTime);
		// console.log(this.name + ': Date.now() = ', Date.now());
		if (maxAgeSeconds) {
			if (updatedTime + maxAgeSeconds * 1000 < Date.now()) {
				return true;
			}
		}
		return false;
	},
	
	getColors: function(sub) {
		this.log(sub.topic);
		this.log("Colors:", sub.colors);
		this.log("Value: ", sub.value);
		if (!sub.colors || sub.colors.length == 0) {
			return {};
		}
	
		let colors;
		for (i = 0; i < sub.colors.length; i++) {
			colors = sub.colors[i];
			if (sub.value < sub.colors[i].upTo) {
				break;
			}
		}
	
		return colors;
	},
	
	multiply: function(sub, value) {
		if (!sub.multiply && !sub.divide) {
			return value;
		}
		if (!value) {
			return value;
		}
		if (isNaN(value)) {
			return value;
		}
		let res = (+value * (sub.multiply || 1)) / (sub.divide || 1);
		return isNaN(res) ? value : "" + res;
	},
	
	convertValue: function(sub) {
		if (!sub.conversions || sub.conversions.length == 0) {
			return sub.value;
		}
		for (i = 0; i < sub.conversions.length; i++) {
			if (sub.value == sub.conversions[i].from) {
				return sub.conversions[i].to;
			}
		}
		return sub.value;
	},
	
	
	
});
