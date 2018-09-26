const {promisify} = require ('util');
const fs = require ('fs');
const stackTrace = require ('stack-trace');
const sanitizeFilename = require ('sanitize-filename');
const {
	dirname,
	join
} = require ('path');

const mkdirp = promisify (require ('mkdirp'));
const exists = promisify (fs.exists);
const writeFile = promisify (fs.writeFile);


const writeJSON = (path, data) =>
	writeFile (
		path,
		JSON.stringify (data, null, '\t')
	);


function parentPath () {
	const trace = stackTrace.get ();
	const currentFile = trace.shift ().getFileName ();
	const parentFile = trace
		.find ((t) =>
			t.getFileName () !== currentFile
		)
		.getFileName();

	return dirname (parentFile);
}


async function ensureDir (path) {
	if (!await exists (path)) {
		await mkdirp (path);
	}
}


module.exports =
class Rock {
	constructor (options) {
		this.options = options;

		this.isRecording = null;
		this.isReplaying = null;
		this.isRecorded = null;

		this.records = null;
		this.calls = null;
		this.interceptors = null;
	}

	async setup () {
		const {
			fixturePath,
			fixtureFilePath,
			mode
		} = this.options;

		this.interceptors = [];

		this.isRecorded = await exists (fixtureFilePath);

		if (this.isRecorded) {
			this.isReplaying = (mode !== 'wild');
			this.isRecording = false;

			this.records = await this.load ();
			this.calls = {};
		} else {
			await ensureDir (fixturePath);

			this.isReplaying = false;
			this.isRecording = (mode === 'record');

			this.records = {};
		}

		return this;
	}

	intercept (object, methodName) {
		const {interceptors} = this;
		const original = object [methodName];
		const index = `${methodName}-${interceptors.length}`;
		const interceptor = {
			index,
			object,
			methodName,
			original
		};

		if (this.isRecording) {
			this.createRecorderInterceptor (interceptor);
		} else if (this.isReplaying) {
			this.createPlayerInterceptor (interceptor);
		} else {
			return;
		}

		interceptors.push (interceptor);
	}

	restore () {
		if (this.interceptors) {
			this.interceptors
				.forEach (({object, methodName, original}) =>
					object [methodName] = original
				);
		}

		delete this.interceptors;
		delete this.records;
	}

	createRecorderInterceptor ({index, object, methodName, original}) {
		const records = this.records [index] = [];

		object [methodName] = async function (...args) {
			try {
				const value = await original.apply (object, args);

				records.push ({
					ts: Date.now (),
					value
				});

				return value;
			} catch (e) {
				records.push ({
					ts: Date.now (),
					type: 'error',
					value: {
						message: e.message,
						stack: e.stack,
						code: e.code
					}
				});

				throw e;
			}
		};
	}

	createPlayerInterceptor ({object, methodName, index}) {
		const calls = this.calls;

		calls [index] = 0;

		object [methodName] = (...args) => {
			const records = this.records [index];
			const i = calls [index]++;
			const record = records [i];

			if (!record) {
				throw new Error ('Record not found');
			} else if (record.type === 'error') {
				return Promise.reject (
					new Error (record.message)
				);
			} else {
				return Promise.resolve (record.value);
			}
		};
	}

	async completeRecording () {
		if (this.isRecording) {
			await this.save ();
		}

		this.restore ();
	}

	save () {
		const {
			records,
			options: {fixtureFilePath}
		} = this;

		return writeJSON (fixtureFilePath, records);
	}

	load () {
		return require (
			this.options.fixtureFilePath
		);
	}

	static record (fixtureName, options = {}) {
		const fixturePath =
			options.fixturePath || join (parentPath (), '__rock-fixtures__');
		const mode = options.mode || 'record';
		const fixtureFilePath = `${fixturePath}/${sanitizeFilename (fixtureName)}.json`;

		Object.assign (options, {
			fixtureName,
			fixturePath,
			fixtureFilePath,
			mode
		});

		const rock = new Rock (options);

		this.register (rock);

		return rock.setup ();
	}

	static register (instance) {
		if (!this.rocks) {
			this.rocks = [];
		}

		this.rocks.push (instance);
	}

	static clearAll () {
		if (!this.rocks) {
			return;
		}

		this.rocks.forEach ((rock) => {
			rock.restore ()
		});

		delete this.rocks;
	}
}
