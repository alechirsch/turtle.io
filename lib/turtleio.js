"use strict";

const each = require("retsu").each,
	defer = require("tiny-defer"),
	http = require("http"),
	https = require("https"),
	path = require("path"),
	fs = require("fs"),
	moment = require("moment"),
	zlib = require("zlib"),
	middleware = require(path.join(__dirname, "middleware.js")),
	regex = require(path.join(__dirname, "regex.js")),
	utility = require(path.join(__dirname, "utility.js")),
	verbs = ["DELETE", "GET", "POST", "PUT", "PATCH"];

class TurtleIO {
	constructor () {
		this.config = {
			address: "0.0.0.0",
			default: "localhost",
			cacheSize: 1000,
			catchAll: true,
			compress: true,
			etags: {
				notify: false,
				ignore: [],
				invalid: [],
				onchange: () => {}
			},
			headers: {
				"accept-ranges": "bytes",
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
				cert: null,
				key: null,
				pfx: null
			},
			uid: 0
		};
		this.etags = null;
		this.router = null;
		this.server = null;
		this.watching = new Map();
	}

	all (route, fn, host) {
		each(verbs, i => this.router.use(route, fn, i, host));

		return this;
	}

	allows (...args) {
		return this.router.allows(...args);
	}

	allowed (...args) {
		return this.router.allowed(...args);
	}

	blacklist (...args) {
		return this.router.blacklist(...args);
	}

	clf (req, res, headers) {
		let user = "-";

		if (req.parsed.auth !== null && req.parsed.auth.indexOf(":") > -1) {
			user = req.parsed.auth.split(":")[0] || "-";
		}

		return this.config.logging.format.replace("%v", req.headers.host)
			.replace("%h", req.ip || "-")
			.replace("%l", "-")
			.replace("%u", user)
			.replace("%t", "[" + moment().format(this.config.logging.time) + "]")
			.replace("%r", req.method + " " + req.url + " HTTP/1.1")
			.replace("%>s", res.statusCode)
			.replace("%b", headers["content-length"] || "-")
			.replace("%{Referer}i", req.headers.referer || "-")
			.replace("%{User-agent}i", req.headers["user-agent"] || "-");
	}

	canETag (pathname, method, headers = this.config.headers) {
		return regex.get_only.test(method) && this.etags.valid(headers) && !this.config.etags.invalid.filter(i => i.test(pathname)).length;
	}

	compression (encoding = "", mimetype = "") {
		let result = "";

		if (this.config.compress === true && regex.compress.test(mimetype)) {
			each(utility.explode(encoding), i => {
				let output;

				if (regex.gzip.test(i)) {
					result = "gz";
					output = false;
				} else if (regex.def.test(i)) {
					result = "zz";
					output = false;
				}

				return output;
			});
		}

		return result;
	}

	del (route, fn, host) {
		this.router.use(route, fn, "DELETE", host);

		return this;
	}

	delete (route, fn, host) {
		this.router.use(route, fn, "DELETE", host);

		return this;
	}

	error (req, res, status = 500, msg) {
		let body, headers;

		if (msg === void 0) {
			body = "<!DOCTYPE html><html><head><title>" + http.STATUS_CODES[status] + "</title></head><body><h1>" + http.STATUS_CODES[status] + "</h1></body></html>";
			headers = {"cache-control": "no-cache", "content-type": "text/html; charset=utf-8"};
		}

		return this.send(req, res, msg || body, status, headers);
	}

	etag (...args) {
		return this.etags.create(args.join("-"));
	}

	get (route, fn, host) {
		this.router.use(route, fn, "GET", host);

		return this;
	}

	headers (req, res, status, body, headers, pipe) {
		const result = utility.merge(utility.clone(this.config.headers), headers),
			options = {},
			isOptions = regex.options.test(req.method);
		let size;

		if (req.allow !== "" && result.allow === void 0) {
			result.allow = req.allow;
		}

		if (regex.head.test(req.method)) {
			result.connection = "close";
		}

		if (isOptions && body === "") {
			size = result["content-length"] = 0;
		} else {
			if (isOptions && body !== "") {
				result["content-length"] = Buffer.byteLength(body.toString());
			} else if (!pipe && result["content-length"] === void 0) {
				result["content-length"] = Buffer.byteLength(body.toString());
			} else if (pipe) {
				delete result["content-length"];
				result["transfer-encoding"] = "chunked";
			}

			size = result["content-length"] || 0;
		}

		if (!pipe && req.headers.range && headers["content-range"] === void 0) {
			each(req.headers.range.split(",")[0].split("-"), (i, idx) => {
				options[idx === 0 ? "start" : "end"] = i ? parseInt(i, 10) : void 0;
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
			delete result.etag;
			delete result["last-modified"];
		}

		if (status === 304) {
			delete result["content-length"];
			delete result["last-modified"];
		}

		if (status === 404) {
			delete result.allow;
			delete result["access-control-allow-methods"];
		}

		if (result["last-modified"] === "") {
			delete result["last-modified"];
		}

		if (req.timer !== void 0) {
			result["x-response-time"] = ((req.timer.stopped.length === 0 ? req.timer.stop() : req.timer).diff() / 1000000).toFixed(2) + " ms";
		}

		this.log("Generated headers", "debug");

		return result;
	}

	hash (arg) {
		return this.router.hash(arg);
	}

	log (msg, level = "debug") {
		if (this.config.logging.enabled) {
			let idx = this.config.logging.levels[level];

			if (idx <= this.config.logging.levels[this.config.logging.level]) {
				process.nextTick(() => console[idx > 4 ? "log" : "error"](msg));
			}
		}

		return this;
	}

	options (route, fn, host) {
		this.router.use(route, fn, "OPTIONS", host);

		return this;
	}

	patch (route, fn, host) {
		this.router.use(route, fn, "PATCH", host);

		return this;
	}

	post (route, fn, host) {
		this.router.use(route, fn, "POST", host);

		return this;
	}

	put (route, fn, host) {
		this.router.use(route, fn, "PUT", host);

		return this;
	}

	send (req, res, body = "", status = 200, headers = {"content-type": "text/plain"}) {
		const deferred = defer(),
			pipe = typeof body.on === "function";
		let indent = this.config.json,
			header, lheaders, compression, compressionMethod;

		let errHandler = e => {
			try {
				res.statusCode = 500;
				res.writeHead(500, lheaders || headers);
				res.end(http.STATUS_CODES[500]);
			} catch (err) {
				void 0;
			}

			this.log(e.stack, "warn");
			deferred.reject(e);
		};

		if (!res.headersSent) {
			// Setting a watcher to knock it out of cache
			if (req.file !== void 0) {
				this.watch(req.parsed.href, req.file.path);
			}

			res.statusCode = status;

			if (!pipe && body instanceof Object || body instanceof Array) {
				if (req.headers.accept !== void 0) {
					header = regex.indent.exec(req.headers.accept);
					indent = header !== null ? parseInt(header[1], 10) : this.config.json;
				}

				body = JSON.stringify(body, null, indent);
				headers["content-length"] = Buffer.byteLength(body);
				headers["content-type"] = "application/json";
			}

			lheaders = this.headers(req, res, status, body, headers, pipe);

			if (status !== 416 && req.headers.range && lheaders["content-range"] === void 0) {
				return this.error(req, res, 416, http.STATUS_CODES[416]);
			}

			if (body !== null && body !== "") {
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
					body.pipe(zlib[compressionMethod]()).on("error", errHandler).on("close", () => deferred.resolve(true)).pipe(res);
				} else {
					zlib[compressionMethod.replace("create", "").toLowerCase()](body, (e, data) => {
						if (e !== null) {
							errHandler(e);
						} else {
							lheaders["content-length"] = data.length;

							try { // Might be an error from a failed compression stream
								res.writeHead(status, lheaders);
							} catch (err) {
								this.log("Headers have already been sent for " + res.statusCode + " response", "error");
							}

							res.end(data);
							deferred.resolve(true);
						}
					});
				}
			} else {
				if (lheaders["content-range"] !== void 0 && lheaders["content-range"] !== "") {
					status = res.statusCode = 206;
				}

				res.writeHead(status, lheaders);

				if (pipe) {
					body.on("error", errHandler).on("close", () => deferred.resolve(true)).pipe(res);
				} else {
					if (req.range !== void 0) {
						res.end(new Buffer(body.toString()).slice(req.range.start, req.range.end + 1).toString());
					} else {
						res.end(body.toString());
					}

					deferred.resolve(true);
				}
			}
		}

		return deferred.promise;
	}

	start () {
		let drop = () => {
			if (this.config.uid && !isNaN(this.config.uid) && typeof process.setuid === "function") {
				try {
					process.setuid(this.config.uid);
					this.log("Dropped process to run as uid " + this.config.uid, "debug");
				} catch (e) {
					this.log(e.stack, "warn");
				}
			}
		};

		this.config.etags.invalid = this.config.etags.ignore.map(i => new RegExp(i, "i"));

		if (this.server === null) {
			if (this.config.ssl.cert === null && this.config.ssl.pfx === null && this.config.ssl.key === null) {
				this.server = http.createServer(this.router.route).listen(this.config.port, this.config.address, drop);
			} else {
				this.server = https.createServer({
					cert: this.config.ssl.cert ? fs.readFileSync(this.config.ssl.cert) : void 0,
					pfx: this.config.ssl.pfx ? fs.readFileSync(this.config.ssl.pfx) : void 0,
					key: this.config.ssl.key ? fs.readFileSync(this.config.ssl.key) : void 0,
					port: this.config.port,
					host: this.config.address
				}, this.router.route).listen(this.config.port, this.config.address, drop);
			}

			this.log("Started server on port " + this.config.address + ":" + this.config.port, "debug");
		}

		return this;
	}

	"static" (req, res) {
		middleware.file(req, res, err => {
			if (err !== void 0) {
				res.error(err);
			} else {
				middleware.stream(req, res, err2 => {
					if (err2 !== void 0) {
						res.error(err2);
					}
				});
			}
		});
	}

	stop () {
		this.config.ignore.length = 0;
		each(this.watching, (key, watcher) => watcher.close());
		this.watching.clear();

		if (this.server !== null) {
			this.server.close();
			this.server = null;
		}

		this.log("Stopped server on port " + this.config.address + ":" + this.config.port, "debug");

		return this;
	}

	unwatch (uri, fpath) {
		const key = this.hash(fpath);

		this.etags.unregister(uri);
		this.log("Unregistered " + uri + " from cache", "debug");

		if (this.watching.has(key)) {
			this.watching.get(key).close();
			this.watching.delete(key);
			this.log("Deleted file watcher for " + fpath, "debug");
		}

		return this;
	}

	use (...args) {
		return this.router.use(...args);
	}

	watch (uri, fpath) {
		const key = this.hash(fpath);

		if (!this.watching.has(key)) {
			this.watching.set(key, fs.watch(fpath, () => this.unwatch(uri, fpath)));
			this.watching.get(key).on("error", () => this.unwatch(uri, fpath));
			this.log("Created watcher for " + fpath + " (" + uri + ")", "debug");
		}

		return this;
	}

	validate (req, res) {
		const deferred = defer();

		if (req.file === void 0) {
			fs.lstat(req.filepath, (e, stats) => {
				if (e !== null) {
					deferred.resolve();
				} else if (!stats.isDirectory()) {
					req.file = {path: req.filepath, stats: stats};
					req.server.log("Routed request to disk", "debug");
					deferred.resolve();
				} else if (regex.get.test(req.method) && !regex.dir.test(req.parsed.pathname)) {
					res.redirect((req.parsed.pathname !== "/" ? req.parsed.pathname : "") + "/" + req.parsed.search, 301);
				} else {
					let count = 0,
						handled = false,
						nth = req.server.config.index.length;

					if (nth > 0) {
						each(req.server.config.index, i => {
							let npath = path.join(req.filepath, i);

							fs.lstat(npath, (err, lstats) => {
								if (err === null && !handled) {
									handled = true;
									req.file = {path: npath, stats: lstats};
									req.server.log("Routed request to disk", "debug");
									deferred.resolve();
								} else if (++count === nth && !handled) {
									deferred.resolve();
								}
							});
						});
					} else {
						deferred.resolve();
					}
				}
			});
		} else {
			deferred.resolve();
		}

		return deferred.promise;
	}
}

module.exports = TurtleIO;
