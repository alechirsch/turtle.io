"use strict";

var _createClass = function () { function defineProperties (target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var array = require("retsu"),
    defer = require("tiny-defer"),
    lru = require("tiny-lru"),
    http = require("http"),
    https = require("https"),
    path = require("path"),
    fs = require("fs"),
    precise = require("precise"),
    mime = require("mimetype"),
    moment = require("moment"),
    mmh3 = require("murmurhash3js").x86.hash32,
    zlib = require("zlib"),
    middleware = require(path.join(__dirname, "middleware.js")),
    regex = require(path.join(__dirname, "regex.js")),
    router = require(path.join(__dirname, "router.js")),
    utility = require(path.join(__dirname, "utility.js")),
    version = require(path.join(__dirname, "..", "package.json")).version;

var TurtleIO = function () {
	function TurtleIO () {
		_classCallCheck(this, TurtleIO);

		this.config = {
			address: "0.0.0.0",
			default: "localhost",
			cacheSize: 1000,
			catchAll: true,
			compress: true,
			headers: {
				"accept-ranges": "bytes",
				"cache-control": "public, max-age=300, must-revalidate",
				"content-type": "text/html; charset=utf-8"
			},
			hosts: {},
			index: ["index.htm", "index.html"],
			json: 2,
			logging: {
				enabled: true,
				stack: true,
				format: "%v %l %u %t \"%r\" %>s %b \"%{Referer}i\" \"%{User-agent}i\"",
				level: "info",
				levels: {
					"emerg": 0,
					"alert": 1,
					"crit": 2,
					"error": 3,
					"warn": 4,
					"notice": 5,
					"info": 6,
					"debug": 7
				},
				time: "D/MMM/YYYY:HH:mm:ss ZZ"
			},
			maxBytes: 1048576,
			port: 8000,
			root: "",
			seed: 625,
			ssl: {
				key: null,
				cert: null,
				ciphers: null,
				secureProtocol: null
			},
			uid: 0
		};
		this.etags = null;
		this.router = null;
		this.server = null;
		this.server = null;
		this.watching = new Map();
	}

	_createClass(TurtleIO, [{
		key: "all",
		value: function all (route, fn, host) {
			var _this = this;

			array.each(this.router.verbs, function (i) {
				_this.router.use(route, fn, host, i);
			});

			return this;
		}
	}, {
		key: "allows",
		value: function allows () {
			var _router;

			return (_router = this.router).allows.apply(_router, arguments);
		}
	}, {
		key: "allowed",
		value: function allowed () {
			var _router2;

			return (_router2 = this.router).allowed.apply(_router2, arguments);
		}
	}, {
		key: "blacklist",
		value: function blacklist () {
			var _router3;

			return (_router3 = this.router).blacklist.apply(_router3, arguments);
		}
	}, {
		key: "clf",
		value: function clf (req, res, headers) {
			var user = "-";

			if (req.parsed.auth && req.parsed.auth.indexOf(":") > -1) {
				user = req.parsed.auth.split(":")[0] || "-";
			}

			return this.config.logging.format.replace("%v", req.headers.host).replace("%h", req.ip || "-").replace("%l", "-").replace("%u", user).replace("%t", "[" + moment().format(this.config.logging.time) + "]").replace("%r", req.method + " " + req.url + " HTTP/1.1").replace("%>s", res.statusCode).replace("%b", headers["content-length"] || "-").replace("%{Referer}i", req.headers.referer || "-").replace("%{User-agent}i", req.headers["user-agent"] || "-");
		}
	}, {
		key: "compression",
		value: function compression () {
			var encoding = arguments.length <= 0 || arguments[0] === undefined ? "" : arguments[0];
			var mimetype = arguments.length <= 1 || arguments[1] === undefined ? "" : arguments[1];

			var result = "";

			if (this.config.compress === true && regex.compress.test(mimetype)) {
				array.each(utility.explode(encoding), function (i) {
					if (regex.gzip.test(i)) {
						result = "gz";
						return false;
					}

					if (regex.def.test(i)) {
						result = "zz";
						return false;
					}
				});
			}

			return result;
		}
	}, {
		key: "decorate",
		value: function decorate (req, res) {
			var _this2 = this;

			var timer = precise().start(), parsed = this.parse(this.url(req)), update = false;

			req.body = "";
			res.header = res.setHeader;
			req.ip = req.headers["x-forwarded-for"] ? array.last(req.headers["x-forwarded-for"].split(/\s*,\s*/g)) : req.connection.remoteAddress;
			res.locals = {};
			req.parsed = parsed;
			req.query = parsed.query;
			req.server = this;
			req.timer = timer;
			req.host = this.router.host(parsed.hostname) || this.config.default;

			if (!this.router.allowed("GET", req.parsed.pathname, req.host)) {
				this.get(req.parsed.pathname, function (req2, res2, next2) {
					_this2.request(req2, res2).then(next2, next2);
				}, req.host);

				update = true;
			}

			req.allow = this.router.allows(req.parsed.pathname, req.host, update);

			res.redirect = function (target) {
				return _this2.send(req, res, "", 302, { location: target });
			};

			res.respond = function (arg, status, headers) {
				return _this2.send(req, res, arg, status, headers);
			};

			res.error = function (status, arg) {
				return _this2.error(req, res, status, arg);
			};

			res.send = function (arg, status, headers) {
				return _this2.send(req, res, arg, status, headers);
			};
		}
	}, {
		key: "del",
		value: function del (route, fn, host) {
			this.router.use(route, fn, host, "DELETE");

			return this;
		}
	}, {
		key: "delete",
		value: function _delete (route, fn, host) {
			this.router.use(route, fn, host, "DELETE");

			return this;
		}
	}, {
		key: "error",
		value: function error (req, res) {
			var status = arguments.length <= 2 || arguments[2] === undefined ? 500 : arguments[2];
			var msg = arguments[3];

			var body = void 0;

			if (msg === undefined) {
				body = "<!DOCTYPE html><html><head><title>" + http.STATUS_CODES[status] + "</title></head><body><h1>" + http.STATUS_CODES[status] + "</h1></body></html>";
			}

			return this.send(req, res, msg || body, status, { "cache-control": "no-cache" });
		}
	}, {
		key: "etag",
		value: function etag () {
			for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
				args[_key] = arguments[_key];
			}

			return this.hash(args.join("-"));
		}
	}, {
		key: "get",
		value: function get (route, fn, host) {
			this.router.use(route, fn, host, "GET");

			return this;
		}
	}, {
		key: "handle",
		value: function handle (req, res, fpath, uri, dir, stat) {
			var _this3 = this;

			var deferred = defer(), allow = req.allow, write = array.contains(allow, dir ? "POST" : "PUT"), del = array.contains(allow, "DELETE"), method = req.method, status = 200, letag = void 0, headers = void 0, mimetype = void 0, modified = void 0, size = void 0, pathname = void 0, invalid = void 0, out_dir = void 0, in_dir = void 0, options = void 0;

			if (!dir) {
				pathname = req.parsed.pathname.replace(regex.root, "");
				invalid = (pathname.replace(regex.dir, "").split("/").filter(function (i) {
					return i !== ".";
				})[0] || "") === "..";
				out_dir = !invalid ? (pathname.match(/\.{2}\//g) || []).length : 0;
				in_dir = !invalid ? (pathname.match(/\w+?(\.\w+|\/)+/g) || []).length : 0;

				if (invalid) {
					deferred.reject(new Error(404));
				} else if (out_dir > 0 && out_dir >= in_dir) {
					deferred.reject(new Error(404));
				} else if (regex.get.test(method)) {
					mimetype = mime.lookup(fpath);
					size = stat.size;
					modified = stat.mtime.toUTCString();
					letag = "\"" + this.etag(uri, size, stat.mtime) + "\"";
					headers = {
						allow: allow,
						"content-length": size,
						"content-type": mimetype,
						etag: letag,
						"last-modified": modified
					};

					if (regex.get_only.test(method)) {
						this.watch(req.parsed.href, fpath);

						if (req.headers["if-none-match"] === letag) {
							delete headers["content-length"];
							this.send(req, res, "", 304, headers).then(deferred.resolve, deferred.reject);
						} else if (!req.headers["if-none-match"] && Date.parse(req.headers["if-modified-since"]) >= stat.mtime) {
							delete headers["content-length"];
							this.send(req, res, "", 304, headers).then(deferred.resolve, deferred.reject);
						} else {
							options = {};

							// Setting the partial content headers
							if (req.headers.range) {
								array.each(req.headers.range.split(",")[0].split("-"), function (i, idx) {
									options[idx === 0 ? "start" : "end"] = i ? parseInt(i, 10) : undefined;
								});

								// Byte offsets
								if (isNaN(options.start) && !isNaN(options.end)) {
									options.start = size - options.end;
									options.end = size;
								} else if (isNaN(options.end)) {
									options.end = size;
								}

								if (options.start >= options.end || isNaN(options.start) || isNaN(options.start)) {
									return this.error(req, res, 416, http.STATUS_CODES[416]).then(deferred.resolve, deferred.reject);
								}

								status = 206;
								headers["content-range"] = "bytes " + options.start + "-" + options.end + "/" + size;
								headers["content-length"] = options.end - options.start + 1;
							}

							this.send(req, res, fs.createReadStream(fpath, options), status, headers).then(deferred.resolve, deferred.reject);
						}
					} else {
						this.send(req, res, "", 200, headers).then(deferred.resolve, deferred.reject);
					}
				} else if (regex.del.test(method) && del) {
					this.unregister(req.parsed.href, fpath);

					fs.unlink(fpath, function (e) {
						if (e) {
							_this3.error(req, res, 500).then(deferred.resolve, deferred.reject);
						} else {
							_this3.send(req, res, "", 204, {}).then(deferred.resolve, deferred.reject);
						}
					});
				} else if (regex.put.test(method) && write) {
					this.write(req, res, fpath).then(deferred.resolve, deferred.reject);
				} else {
					this.error(req, res, 500).then(deferred.resolve, deferred.reject);
				}
			} else if ((regex.post.test(method) || regex.put.test(method)) && write) {
				this.write(req, res, fpath).then(deferred.resolve, deferred.reject);
			} else {
				this.error(req, res, 405, http.STATUS_CODES[405]).then(deferred.resolve, deferred.reject);
			}

			return deferred.promise;
		}
	}, {
		key: "headers",
		value: function headers (req, res, status, body, _headers, pipe) {
			var result = utility.merge(utility.clone(this.config.headers), _headers), cors = ["access-control-allow-origin", "access-control-allow-credentials", "access-control-expose-headers", "access-control-max-age", "access-control-allow-methods", "access-control-allow-headers"], options = {}, size = void 0;

			if (!result.allow) {
				result.allow = req.allow;
			}

			if (!result.date) {
				result.date = new Date().toUTCString();
			}

			if (!req.cors) {
				array.each(cors, function (i) {
					delete result[i];
				});
			} else {
				array.each(cors, function (i) {
					result[i] = result[i.replace("access-control-", "")] || "";
				});

				result["access-control-allow-origin"] = req.headers.origin || req.headers.referer.replace(/\/$/, "");
				result["access-control-allow-credentials"] = "true";
				result["access-control-allow-methods"] = result.allow;
			}

			if (!pipe && result["content-length"] === undefined) {
				result["content-length"] = Buffer.byteLength(body.toString());
			} else if (pipe) {
				delete result["content-length"];
				result["transfer-encoding"] = "chunked";
			}

			size = result["content-length"] || 0;

			if (!pipe && req.headers.range && _headers["content-range"] === undefined) {
				array.each(req.headers.range.split(",")[0].split("-"), function (i, idx) {
					options[idx === 0 ? "start" : "end"] = i ? parseInt(i, 10) : undefined;
				});

				// Byte offsets
				if (isNaN(options.start) && !isNaN(options.end)) {
					options.start = size - options.end;
					options.end = size;
				} else if (isNaN(options.end)) {
					options.end = size;
				}

				if (options.start >= options.end || isNaN(options.start) || isNaN(options.start)) {
					result["content-range"] = "";
				} else {
					req.range = options;
					result["content-range"] = "bytes " + options.start + "-" + options.end + "/" + size;
					result["content-length"] = options.end - options.start + 1;
				}
			}

			if (!regex.get.test(req.method) || status >= 400) {
				if (result["cache-control"] === undefined) {
					result["cache-control"] = "no-cache";
				}

				delete result.etag;
				delete result["last-modified"];
			}

			if (status === 304) {
				delete result["content-length"];
				delete result["last-modified"];
			}

			if (status === 404) {
				delete result.allow;
				delete result["accept-ranges"];
				delete result["access-control-allow-methods"];
			}

			if (status >= 500) {
				delete result["accept-ranges"];
			}

			if (result["last-modified"] === "") {
				delete result["last-modified"];
			}

			result["x-response-time"] = ((req.timer.stopped.length === 0 ? req.timer.stop() : req.timer).diff() / 1000000).toFixed(2) + " ms";

			this.log("Generated headers", "debug");

			return result;
		}
	}, {
		key: "hash",
		value: function hash (arg) {
			return mmh3(arg, this.config.seed);
		}
	}, {
		key: "log",
		value: function log (msg) {
			var level = arguments.length <= 1 || arguments[1] === undefined ? "debug" : arguments[1];

			var idx = void 0;

			if (this.config.logging.enabled) {
				idx = this.config.logging.levels[level];

				if (idx <= this.config.logging.levels[this.config.logging.level]) {
					process.nextTick(function () {
						console[idx > 4 ? "log" : "error"](msg);
					});
				}
			}

			return this;
		}
	}, {
		key: "parse",
		value: function parse (arg) {
			return utility.parse(arg);
		}
	}, {
		key: "patch",
		value: function patch (route, fn, host) {
			this.router.use(route, fn, host, "PATCH");

			return this;
		}
	}, {
		key: "pipeline",
		value: function pipeline (req, res) {
			var _this4 = this;

			this.decorate(req, res);
			this.router.route(req, res).catch(function (e) {
				var body = void 0, status = void 0;

				if (isNaN(e.message)) {
					status = 500;
					body = e.message;
				} else {
					status = Number(e.message);
					body = e.extended || undefined;

					if (e.extended) {
						_this4.log(e.extended, "error");
					}
				}

				return _this4.error(req, res, status, body);
			});

			return this;
		}
	}, {
		key: "post",
		value: function post (route, fn, host) {
			this.router.use(route, fn, host, "POST");

			return this;
		}
	}, {
		key: "put",
		value: function put (route, fn, host) {
			this.router.use(route, fn, host, "PUT");

			return this;
		}
	}, {
		key: "register",
		value: function register (uri, state) {
			delete state.headers["cache-control"];
			delete state.headers["content-length"];
			delete state.headers["content-encoding"];
			delete state.headers.date;
			delete state.headers.server;
			delete state.headers["transfer-encoding"];
			delete state.headers["x-powered-by"];
			delete state.headers["x-response-time"];
			delete state.headers["access-control-allow-origin"];
			delete state.headers["access-control-expose-headers"];
			delete state.headers["access-control-max-age"];
			delete state.headers["access-control-allow-credentials"];
			delete state.headers["access-control-allow-methods"];
			delete state.headers["access-control-allow-headers"];
			this.etags.set(uri, state);
			this.log("Registered " + uri + " in cache", "debug");

			return this;
		}
	}, {
		key: "request",
		value: function request (req, res) {
			var _this5 = this;

			var deferred = defer(), method = req.method, handled = false, count = void 0, lpath = void 0, nth = void 0, root = void 0;

			if (req.headers.expect) {
				deferred.reject(new Error(417));
			} else {
				root = path.join(this.config.root, this.config.hosts[req.host]);
				lpath = path.join(root, req.parsed.pathname.replace(regex.dir, ""));

				fs.lstat(lpath, function (e, stats) {
					if (e) {
						deferred.reject(new Error(404));
					} else if (!stats.isDirectory()) {
						_this5.handle(req, res, lpath, req.parsed.href, false, stats).then(deferred.resolve, deferred.reject);
					} else if (regex.get.test(method) && !regex.dir.test(req.parsed.pathname)) {
						_this5.send(req, res, "", 301, { "location": (req.parsed.pathname !== "/" ? req.parsed.pathname : "") + "/" + req.parsed.search }).then(deferred.resolve, deferred.reject);
					} else if (!regex.get.test(method)) {
						_this5.handle(req, res, lpath, req.parsed.href, true).then(deferred.resolve, deferred.reject);
					} else {
						count = 0;
						nth = _this5.config.index.length;

						array.each(_this5.config.index, function (i) {
							var npath = path.join(lpath, i);

							fs.lstat(npath, function (err, lstats) {
								if (!err && !handled) {
									handled = true;
									_this5.handle(req, res, npath, (req.parsed.pathname !== "/" ? req.parsed.pathname : "") + "/" + i + req.parsed.search, false, lstats).then(deferred.resolve, deferred.reject);
								} else if (++count === nth && !handled) {
									deferred.reject(new Error(404));
								}
							});
						});
					}
				});
			}

			this.log("Routed request to disk", "debug");

			return deferred.promise;
		}
	}, {
		key: "send",
		value: function send (req, res) {
			var body = arguments.length <= 2 || arguments[2] === undefined ? "" : arguments[2];

			var _this6 = this;

			var status = arguments.length <= 3 || arguments[3] === undefined ? 200 : arguments[3];
			var headers = arguments.length <= 4 || arguments[4] === undefined ? { "content-type": "text/plain" } : arguments[4];

			var deferred = defer(), pipe = typeof body.on === "function", indent = this.config.json, header = void 0, lheaders = void 0, compression = void 0, compressionMethod = void 0;

			var errHandler = function errHandler (e) {
				try {
					res.statusCode = 500;
					res.end(http.STATUS_CODES[500]);
				} catch (err) {
					void 0;
				}

				_this6.log(e.stack, "warn");
				deferred.reject(e);
			};

			if (!res._header && !res._headerSent) {
				res.statusCode = status;

				if (!pipe && body instanceof Object || body instanceof Array) {
					if (req.headers.accept) {
						header = regex.indent.exec(req.headers.accept);
						indent = header !== null ? parseInt(header[1], 10) : this.config.json;
					}

					body = JSON.stringify(body, null, indent);
					headers["content-length"] = Buffer.byteLength(body);
					headers["content-type"] = "application/json";
				}

				lheaders = this.headers(req, res, status, body, headers, pipe);

				if (status !== 416 && req.headers.range && !lheaders["content-range"]) {
					return this.error(req, res, 416, http.STATUS_CODES[416]);
				}

				if (body) {
					compression = this.compression(req.headers["accept-encoding"], lheaders["content-type"]);
				}

				if (compression) {
					if (regex.gzip.test(compression)) {
						lheaders["content-encoding"] = "gzip";
						compressionMethod = "createGzip";
					} else {
						lheaders["content-encoding"] = "deflate";
						compressionMethod = "createDeflate";
					}

					if (pipe) {
						lheaders["transfer-encoding"] = "chunked";
						delete lheaders["content-length"];
						res.writeHead(status, lheaders);
						body.pipe(zlib[compressionMethod]()).on("error", errHandler).on("close", function () {
							deferred.resolve(true);
						}).pipe(res);
					} else {
						zlib[compressionMethod.replace("create", "").toLowerCase()](body, function (e, data) {
							if (e) {
								errHandler(e);
							} else {
								lheaders["content-length"] = data.length;
								res.writeHead(status, lheaders);
								res.end(data);
								deferred.resolve(true);
							}
						});
					}
				} else {
					if (lheaders["content-range"]) {
						status = res.statusCode = 206;
					}

					res.writeHead(status, lheaders);

					if (pipe) {
						body.on("error", errHandler).on("close", function () {
							deferred.resolve(true);
						}).pipe(res);
					} else {
						if (req.range) {
							res.end(new Buffer(body.toString()).slice(req.range.start, req.range.end + 1).toString());
						} else {
							res.end(body.toString());
						}

						deferred.resolve(true);
					}
				}

				if (status < 400 && lheaders.etag) {
					this.register(req.parsed.href, {
						etag: lheaders.etag.replace(/"/g, ""),
						headers: utility.clone(lheaders),
						timestamp: parseInt(new Date().getTime() / 1000, 10)
					}, true);
				}

				this.log(this.clf(req, res, lheaders), "info");
			} else {
				this.log("Response already sent", "warn");
				deferred.reject(new Error("Response already sent"));
			}

			return deferred.promise;
		}
	}, {
		key: "start",
		value: function start () {
			var _this7 = this;

			if (!this.server) {
				if (!this.config.ssl.key && !this.config.ssl.cert) {
					this.server = http.createServer(function (req, res) {
						_this7.pipeline(req, res);
					}).listen(this.config.port, this.config.address);
				} else {
					var options = {
						cert: this.config.ssl.cert,
						key: this.config.ssl.key,
						port: this.config.port,
						host: this.config.address
					};
					if (this.config.ssl.ca){
						options.ca = this.config.ssl.ca;
					}
					if (this.config.ssl.ciphers) {
						options.ciphers = this.config.ssl.ciphers;
					}
					if (this.config.ssl.secureProtocol) {
						options.secureProtocol = this.config.ssl.secureProtocol;
					}
					this.server = https.createServer(options, function (req, res) {
						_this7.pipeline(req, res);
					}).listen(this.config.port, this.config.address);
				}

				// Dropping process
				if (this.config.uid && !isNaN(this.config.uid)) {
					process.setuid(this.config.uid);
				}

				this.log("Started server on port " + this.config.address + ":" + this.config.port, "debug");
			}

			return this;
		}
	}, {
		key: "stop",
		value: function stop () {
			if (!this.server) {
				// Stopping inbound requests
				this.server.stop();
				this.server = null;

				// Clearing watchers
				array.each(this.watching, function (key, watcher) {
					watcher.close();
				});

				// Resetting state
				this.etags = lru(this.config.cacheSize);
				this.watching = new Map();

				this.log("Stopped server on port " + this.config.address + ":" + this.config.port, "debug");
			}

			return this;
		}
	}, {
		key: "unregister",
		value: function unregister (uri, fpath) {
			this.etags.remove(uri);
			this.log("Unregistered " + uri + " from cache", "debug");

			if (fpath && this.watching.has(fpath)) {
				this.watching.get(fpath).close();
				this.watching.delete(fpath);
				this.log("Deleted file watcher for " + fpath, "debug");
			}

			return this;
		}
	}, {
		key: "url",
		value: function url (req) {
			var header = req.headers.authorization || "", auth = "", token = void 0;

			if (!utility.isEmpty(header)) {
				token = header.split(regex.space).pop() || "";
				auth = new Buffer(token, "base64").toString();

				if (!utility.isEmpty(auth)) {
					auth += "@";
				}
			}

			return "http" + (this.config.ssl.cert ? "s" : "") + "://" + auth + req.headers.host + req.url;
		}
	}, {
		key: "use",
		value: function use () {
			for (var _len2 = arguments.length, args = Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
				args[_key2] = arguments[_key2];
			}

			return this.router.use.apply(this.router, args);
		}
	}, {
		key: "watch",
		value: function watch (uri, fpath) {
			var _this8 = this;

			if (!this.watching.has(fpath)) {
				this.watching.set(fpath, fs.watch(fpath, function () {
					_this8.unregister(uri, fpath);
				}));

				this.log("Created watcher for " + fpath + " (" + uri + ")", "debug");
			}

			return this;
		}
	}, {
		key: "write",
		value: function write (req, res, fpath) {
			var _this9 = this;

			var deferred = defer(), put = regex.put.test(req.method), body = req.body, allow = req.allow, del = array.contains(req.allow, "DELETE"), status = void 0;

			if (!put && regex.end_slash.test(req.url)) {
				status = del ? 409 : 500;
				this.error(req, res, status, http.STATUS_CODES[status]);
				deferred.resolve(true);
			} else {
				allow = array.remove(utility.explode(allow), "POST").join(", ");

				fs.lstat(fpath, function (e, stat) {
					var letag = void 0;

					if (e) {
						deferred.reject(new Error(404));
					} else {
						letag = "\"" + _this9.etag(req.parsed.href, stat.size, stat.mtime) + "\"";

						if (req.headers["if-none-match"] === undefined || req.headers["if-none-match"] === letag) {
							fs.writeFile(fpath, body, function (err) {
								if (err) {
									deferred.reject(new Error(500));
								} else {
									status = put ? 204 : 201;
									deferred.resolve(_this9.send(req, res, http.STATUS_CODE[status], status, { allow: allow }, false));
								}
							});
						} else if (req.headers["if-none-match"] !== letag) {
							deferred.resolve(_this9.send(req, res, "", 412, {}, false));
						}
					}
				});
			}

			return deferred.promise;
		}
	}]);

	return TurtleIO;
}();

function factory () {
	var cfg = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];
	var errHandler = arguments.length <= 1 || arguments[1] === undefined ? null : arguments[1];

	var obj = new TurtleIO();

	utility.merge(obj.config, cfg);

	if (!obj.config.headers.server) {
		obj.config.headers.server = "turtle.io/" + version + " (" + utility.capitalize(process.platform) + ")";
	}

	if (!obj.config.headers["x-powered-by"]) {
		obj.config.headers["x-powered-by"] = "node.js/" + process.versions.node.replace(/^v/, "");
	}

	if (typeof errHandler === "function") {
		obj.error = errHandler;
	}

	obj.etags = lru(obj.config.cacheSize);
	obj.router = router(obj.config.cacheSize, obj.config.seed);

	// Registering virtual hosts
	obj.router.setHost("all");
	array.each(Object.keys(obj.config.hosts), function (i) {
		obj.router.setHost(i);
	});

	// Setting default middleware
	array.each([middleware.etag, middleware.cors, middleware.connect], function (i) {
		obj.use(i).blacklist(i);
	});

	return obj;
}

module.exports = factory;
