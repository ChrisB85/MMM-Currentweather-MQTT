const mqtt = require('mqtt');
const NodeHelper = require("node_helper");

var servers = [];

module.exports = NodeHelper.create({

	log: function (...args) {
		if (this.config.logging) {
			console.log(this.name, args);
		}
	},

	start: function () {
		console.log(this.name + ': Starting node helper');
		this.loaded = false;
		this.pollers = [];
		this.metnoPayload = null;
	},

	/* Weather sources fetched over HTTP. They live here and not in the module
	 * because met.no requires an identifying User-Agent, a header the browser
	 * refuses to let a page set.
	 */
	startSourcePollers: function (config) {
		var self = this;

		this.pollers.forEach(clearInterval);
		this.pollers = [];

		if (config.metno && config.metno.lat !== null && config.metno.lon !== null) {
			if (config.metno.userAgent) {
				this.addPoller(config.metno.updateInterval, function () {
					return self.fetchMetno(config.metno);
				});
			} else {
				console.log(self.name + ': met.no needs metno.userAgent with a contact address, source disabled');
			}
		}

		if (config.hass && config.hass.token && Object.keys(config.hass.entities || {}).length > 0) {
			this.addPoller(config.hass.updateInterval, function () {
				return self.fetchHass(config.hass);
			});
		}
	},

	addPoller: function (interval, fetcher) {
		var self = this;
		var run = function () {
			fetcher().catch(function (err) {
				console.log(self.name + ': ' + err.message);
			});
		};

		run();
		this.pollers.push(setInterval(run, interval));
	},

	/* MET Norway (yr.no), the API behind Home Assistant's met.no integration.
	 * Their terms of service ask for a contact in the User-Agent and for
	 * conditional requests, hence If-Modified-Since.
	 */
	fetchMetno: async function (config) {
		var headers = { 'User-Agent': config.userAgent };
		if (this.metnoLastModified) {
			headers['If-Modified-Since'] = this.metnoLastModified;
		}

		var response = await fetch(
			'https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=' + config.lat + '&lon=' + config.lon,
			{ headers: headers, signal: AbortSignal.timeout(10000) }
		);

		// 304: the forecast we already have is still the current one. Resend it
		// so the module sees a fresh timestamp instead of ageing it out.
		if (response.status === 304 && this.metnoPayload) {
			this.metnoPayload.time = Date.now();
			this.sendSocketNotification('WEATHER_SOURCE_DATA', this.metnoPayload);
			return;
		}

		if (!response.ok) {
			throw new Error('met.no returned HTTP ' + response.status);
		}

		this.metnoLastModified = response.headers.get('last-modified');

		var body = await response.json();
		var details = body.properties.timeseries[0].data.instant.details;

		this.metnoPayload = {
			source: 'metno',
			time: Date.now(),
			values: {
				temperature: details.air_temperature,
				humidity: details.relative_humidity,
				windSpeed: details.wind_speed,
				windDirection: details.wind_from_direction
			},
			units: { windSpeed: 'ms' }
		};

		this.log('met.no', this.metnoPayload.values);
		this.sendSocketNotification('WEATHER_SOURCE_DATA', this.metnoPayload);
	},

	/* Home Assistant REST API. Reading the values from Home Assistant keeps the
	 * mirror showing the same numbers Home Assistant does.
	 */
	fetchHass: async function (config) {
		var base = (config.useTLS ? 'https://' : 'http://') + config.host + ':' + config.port;
		var values = {};
		var units = {};

		for (var key of Object.keys(config.entities)) {
			var entity = config.entities[key];

			try {
				var response = await fetch(base + '/api/states/' + entity.entity, {
					headers: { Authorization: 'Bearer ' + config.token },
					signal: AbortSignal.timeout(10000)
				});

				if (!response.ok) {
					throw new Error('HTTP ' + response.status);
				}

				var state = await response.json();
				var value = entity.attribute ? state.attributes[entity.attribute] : state.state;

				// Timestamp entities (Sun2 rising and setting) come as ISO 8601
				// strings. The module works in epoch milliseconds.
				if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
					value = Date.parse(value);
				}

				// What Home Assistant reports while an integration is down.
				if (value === null || typeof value === 'undefined' || value === 'unavailable' || value === 'unknown') {
					continue;
				}

				values[key] = value;
				if (entity.unit) {
					units[key] = entity.unit;
				}
			} catch (err) {
				console.log(this.name + ': Home Assistant ' + entity.entity + ': ' + err.message);
			}
		}

		// Nothing readable: stay quiet and let the values age out, so the module
		// falls through to the next source.
		if (Object.keys(values).length === 0) {
			return;
		}

		this.log('Home Assistant', values);
		this.sendSocketNotification('WEATHER_SOURCE_DATA', {
			source: 'hass',
			time: Date.now(),
			values: values,
			units: units
		});
	},

	makeServerKey: function (server) {
		return '' + server.address + ':' + (server.port | '1883' + server.user);
	},

	addServer: function (server) {
		var serverKey = this.makeServerKey(server);
		var mqttServer = {}
		var foundServer = false;
		for (i = 0; i < servers.length; i++) {
			if (servers[i].serverKey === serverKey) {
				mqttServer = servers[i];
				foundServer = true;
			}
		}
		if (!foundServer) {
			mqttServer.serverKey = serverKey;
			mqttServer.address = server.address;
			mqttServer.port = server.port;
			mqttServer.options = {};
			mqttServer.topics = [];
			if (server.user) mqttServer.options.username = server.user;
			if (server.password) mqttServer.options.password = server.password;
		}

		for (i = 0; i < server.subscriptions.length; i++) {
			mqttServer.topics.push(server.subscriptions[i].topic);
		}

		servers.push(mqttServer);
		this.startClient(mqttServer);
	},

	addConfig: function (config) {
		for (i = 0; i < config.mqttServers.length; i++) {
			this.addServer(config.mqttServers[i]);
		}
	},

	startClient: function (server) {

		console.log(this.name + ': Starting client for: ', server);

		var self = this;

		var mqttServer = (server.address.match(/^mqtts?:\/\//) ? '' : 'mqtt://') + server.address;
		if (server.port) {
			mqttServer = mqttServer + ':' + server.port
		}
		console.log(self.name + ': Connecting to ' + mqttServer);

		server.client = mqtt.connect(mqttServer, server.options);

		server.client.on('error', function (err) {
			console.log(self.name + ' ' + server.serverKey + ': Error: ' + err);
		});

		server.client.on('reconnect', function (err) {
			server.value = 'reconnecting'; // Hmmm...
			console.log(self.name + ': ' + server.serverKey + ' reconnecting');
		});

		server.client.on('connect', function (connack) {
			console.log(self.name + ' connected to ' + mqttServer);
			console.log(self.name + ': subscribing to ' + server.topics);
			server.client.subscribe(server.topics);
		});

		server.client.on('message', function (topic, payload) {
			// console.log(self.name + ' ' + topic + payload.toString() );
			self.sendSocketNotification('MQTT_PAYLOAD', {
				serverKey: server.serverKey,
				topic: topic,
				value: payload.toString(),
				time: Date.now()
			});
		});

	},

	socketNotificationReceived: function (notification, payload) {
		var self = this;
		if (notification === 'MQTT_CONFIG') {
			var config = payload;
			self.addConfig(config);
			self.loaded = true;
		}
		if (notification === 'WEATHER_SOURCE_CONFIG') {
			self.config = payload;
			self.startSourcePollers(payload);
		}
	},
});
