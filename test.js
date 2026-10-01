/* eslint-disable max-lines -- Keep the runtime suite in one file. */
import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import Stream from 'node:stream';
import test from 'node:test';
import {inherits} from 'node:util';
import vm from 'node:vm';
import {errorConstructors} from './error-constructors.js';
import {
	addKnownErrorConstructor, serializeError, deserializeError, isErrorLike, NonError,
} from './index.js';

// A value that is not an error-shaped object has to survive on the `NonError` itself, not just be labelled as one
function deserializeNonError(value) {
	const deserialized = deserializeError(value);
	const label = String(value) || typeof value;

	assert.equal(deserialized instanceof NonError, true, `${label} must become a NonError`);
	assert.equal(deserialized.value, value, `${label} must be kept by identity`);
	assert.match(deserialized.message, /^Non-error value:/, `${label} must be described in the message`);
}

test('main', () => {
	const serialized = serializeError(new Error('foo'));
	const properties = Object.keys(serialized);

	assert.equal(properties.includes('name'), true);
	assert.equal(properties.includes('stack'), true);
	assert.equal(properties.includes('message'), true);
});

test('should not let a `__proto__` property overwrite the prototype', () => {
	// `JSON.parse` creates `__proto__` as an own enumerable property, unlike an object literal
	const parsed = JSON.parse('{"message":"m","__proto__":{"polluted":true}}');

	const deserialized = deserializeError(parsed);
	assert.equal(deserialized instanceof Error, true);
	assert.equal('polluted' in deserialized, false);

	const serialized = serializeError(parsed);
	assert.equal('polluted' in serialized, false);
});

test('should not let a nested `__proto__` property overwrite the prototype', () => {
	const parsed = JSON.parse('{"message":"m","nested":{"name":"Error","message":"n","stack":"s","__proto__":{"polluted":true}}}');

	const deserialized = deserializeError(parsed);
	assert.equal(deserialized.nested instanceof Error, true);
	assert.equal(deserialized.nested.message, 'n');
	assert.equal('polluted' in deserialized.nested, false);
});

test('should not throw when an object property cannot be assigned', () => {
	// A getter-only property on the prototype cannot be assigned to, like `DOMException.prototype.code`
	class GetterOnlyError extends Error {
		name = 'GetterOnlyError';

		get locked() {
			return 'inherited';
		}
	}

	addKnownErrorConstructor(GetterOnlyError);

	const deserialized = deserializeError({
		name: 'GetterOnlyError',
		message: 'm',
		stack: 's',
		locked: {nested: true},
	});

	// The property keeps its inherited value instead of crashing, matching how primitive values behave
	assert.equal(deserialized instanceof GetterOnlyError, true);
	assert.equal(deserialized.message, 'm');
	assert.equal(deserialized.locked, 'inherited');
});

if ('DOMException' in globalThis) {
	test('should not throw when deserializing a `DOMException` with an object `code`', () => {
		const deserialized = deserializeError({
			name: 'DOMException',
			message: 'm',
			stack: 's',
			code: {value: 1},
		});

		assert.equal(deserialized instanceof DOMException, true);
	});
}

test('should make every serialized property enumerable', () => {
	const error = new AggregateError([new Error('inner')], 'outer', {cause: new Error('cause')});
	error.custom = 'x';

	const serialized = serializeError(error);

	for (const property of ['name', 'message', 'stack', 'cause', 'errors', 'custom']) {
		assert.equal(Object.hasOwn(serialized, property), true, `"${property}" is missing`);
		assert.equal(Object.getOwnPropertyDescriptor(serialized, property).enumerable, true, `"${property}" is not enumerable`);
	}

	assert.deepEqual(Object.keys(serialized).sort(), ['cause', 'custom', 'errors', 'message', 'name', 'stack']);
});

test('should not return the original object when `.toJSON()` returns itself', () => {
	class CustomError extends Error {
		constructor() {
			super('foo');
			this.name = this.constructor.name;
			this.secret = 'do not touch';
		}

		toJSON() {
			return this;
		}
	}

	const error = new CustomError();
	const serialized = serializeError(error);

	assert.notEqual(serialized, error);
	assert.equal(serialized instanceof Error, false);
	assert.equal(serialized.name, 'CustomError');
	assert.equal(serialized.message, 'foo');

	// Writing to the result must not write through to the original error
	serialized.secret = 'mutated';
	assert.equal(error.secret, 'do not touch');
});

test('should not return the original nested object when `.toJSON()` returns itself', () => {
	const horn = {
		size: 1,
		toJSON() {
			return this;
		},
	};

	const error = new Error('Unicorn');
	error.horn = horn;

	const serialized = serializeError(error);
	assert.notEqual(serialized.horn, horn);
	assert.equal(serialized.horn.size, 1);
});

test('should destroy circular references', () => {
	const object = {};
	object.child = {parent: object};

	const serialized = serializeError(object);
	assert.equal(typeof serialized, 'object');
	assert.equal(serialized.child.parent, '[Circular]');
});

test('should not affect the original object', () => {
	const object = {};
	object.child = {parent: object};

	const serialized = serializeError(object);
	assert.notEqual(serialized, object);
	assert.equal(object.child.parent, object);
});

test('should only destroy parent references', () => {
	const object = {};
	const common = {thing: object};
	object.one = {firstThing: common};
	object.two = {secondThing: common};

	const serialized = serializeError(object);
	assert.equal(typeof serialized.one.firstThing, 'object');
	assert.equal(typeof serialized.two.secondThing, 'object');
	assert.equal(serialized.one.firstThing.thing, '[Circular]');
	assert.equal(serialized.two.secondThing.thing, '[Circular]');
});

test('should work on arrays', () => {
	const object = {};
	const common = [object];
	const x = [common];
	const y = [['test'], common];
	y[0][1] = y;
	object.a = {x};
	object.b = {y};

	const serialized = serializeError(object);
	assert.equal(Array.isArray(serialized.a.x), true);
	assert.equal(serialized.a.x[0][0], '[Circular]');
	assert.equal(serialized.b.y[0][0], 'test');
	assert.equal(serialized.b.y[1][0], '[Circular]');
	assert.equal(serialized.b.y[0][1], '[Circular]');
});

test('should discard buffers', () => {
	const object = {a: Buffer.alloc(1)};
	const serialized = serializeError(object);
	assert.deepEqual(serialized, {a: '[object Buffer]'});
});

for (const property of ['code', 'cause']) {
	test(`should serialize BigInt in the ${property} property as string`, () => {
		const error = new Error('test');
		error[property] = 123_456_789_012_345_678_901n;

		const serialized = serializeError(error);
		assert.equal(serialized[property], '123456789012345678901n');
		assert.doesNotThrow(() => JSON.stringify(serialized));
	});
}

test('should serialize BigInt in an error held by the `cause` property as string', () => {
	const error = new Error('test', {cause: new Error('inner')});
	error.cause.code = 123n;

	const serialized = serializeError(error);
	assert.equal(serialized.cause.code, '123n');
	assert.doesNotThrow(() => JSON.stringify(serialized));
});

test('should serialize BigInt in an error held by the `errors` property as string', () => {
	const error = new AggregateError([new Error('inner')], 'outer');
	error.errors[0].code = 123n;

	const serialized = serializeError(error);
	assert.equal(serialized.errors[0].code, '123n');
	assert.doesNotThrow(() => JSON.stringify(serialized));
});

test('should apply the same conversions to the `cause` property as to regular properties', () => {
	// Each case is checked on an ordinary property and on `cause` at once, since the point is that they agree
	const cases = [
		['a buffer', Buffer.from([1, 2]), '[object Buffer]'],
		['a stream', new Stream.Readable(), '[object Stream]'],
		['a function', () => {}, undefined],
		['a bigint', 123n, '123n'],
	];

	for (const [label, value, expected] of cases) {
		const asProperty = serializeError({message: 'm', data: value});
		const asCause = serializeError(new Error('test', {cause: value}));

		if (expected === undefined) {
			assert.equal(Object.hasOwn(asProperty, 'data'), false, `${label} must be dropped from a regular property`);
			assert.equal(Object.hasOwn(asCause, 'cause'), false, `${label} must be dropped from cause`);
		} else {
			assert.equal(asProperty.data, expected, `${label} as a regular property`);
			assert.equal(asCause.cause, expected, `${label} as cause`);
		}
	}
});

test('should not throw when a typed array has no usable `constructor`', () => {
	const bytes = new Uint8Array([1, 2]);
	bytes.constructor = undefined;

	// Falls through to normal serialization instead of throwing
	const {bytes: serialized} = serializeError({bytes});
	assert.equal(serialized[0], 1);
	assert.equal(serialized[1], 2);
});

test('should only interpret a string `message` as an error', () => {
	// The readme and the type definitions both state this rule
	assert.equal(deserializeError({message: 'm'}) instanceof Error, true);

	for (const value of [{message: 123}, {message: null}, {message: undefined}, {message: {}}, {other: 1}]) {
		assert.equal(deserializeError(value) instanceof NonError, true, `${JSON.stringify(value)} is not an error`);
	}

	// Arrays are never errors, even with a string `message`
	assert.equal(deserializeError(Object.assign(['a'], {message: 'm'})) instanceof NonError, true);
});

test('should match the documented `maxDepth` examples', () => {
	const error = new Error('🦄');
	error.one = {two: {three: {}}};

	// The readme and the type definitions both show these two results
	const levelOne = serializeError(error, {maxDepth: 1});
	assert.equal(levelOne.name, 'Error');
	assert.equal(levelOne.message, '🦄');
	assert.deepEqual(levelOne.one, {});

	const levelTwo = serializeError(error, {maxDepth: 2});
	assert.equal(levelTwo.name, 'Error');
	assert.equal(levelTwo.message, '🦄');
	assert.deepEqual(levelTwo.one, {two: {}});

	// `stack` is part of both results, which the examples abbreviate away elsewhere
	assert.equal(levelOne.stack.includes('🦄'), true);
	assert.equal(levelTwo.stack.includes('🦄'), true);
});

test('should match the documented `toJSON` examples', () => {
	// The readme and the type definitions both show these two results, abbreviated to `{name, message, stack, …}`
	const withDate = new Error('Unicorn');
	withDate.date = new Date(0);
	assert.deepEqual(Object.keys(serializeError(withDate)), ['name', 'message', 'stack', 'date'], 'the error properties come before a custom one');

	const withHorn = new Error('Unicorn');
	withHorn.horn = {
		toJSON() {
			return 'x';
		},
	};
	assert.deepEqual(Object.keys(serializeError(withHorn)), ['name', 'message', 'stack', 'horn']);
	assert.equal(serializeError(withHorn).horn, 'x');
});

test('should not treat a plain object with a `pipe` method as a stream', () => {
	// Streams are also `EventEmitter`s, so a plain object that merely defines `pipe` is not a stream
	const serialized = serializeError({config: {pipe() {}, retries: 3, endpoint: 'x'}});

	assert.deepEqual(serialized, {config: {retries: 3, endpoint: 'x'}});
});

test('should serialize BigInt as string', () => {
	const error = new Error('test');
	error.bigNumber = 123_456_789_012_345_678_901n;
	const serialized = serializeError(error);
	assert.equal(serialized.bigNumber, '123456789012345678901n');
	assert.doesNotThrow(() => JSON.stringify(serialized));
});

test('should discard streams', () => {
	assert.deepEqual(serializeError({s: new Stream.Stream()}), {s: '[object Stream]'}, 'Stream.Stream');
	assert.deepEqual(serializeError({s: new Stream.Readable()}), {s: '[object Stream]'}, 'Stream.Readable');
	assert.deepEqual(serializeError({s: new Stream.Writable()}), {s: '[object Stream]'}, 'Stream.Writable');
	assert.deepEqual(serializeError({s: new Stream.Duplex()}), {s: '[object Stream]'}, 'Stream.Duplex');
	assert.deepEqual(serializeError({s: new Stream.Transform()}), {s: '[object Stream]'}, 'Stream.Transform');
	assert.deepEqual(serializeError({s: new Stream.PassThrough()}), {s: '[object Stream]'}, 'Stream.PassThrough');
});

test('should drop functions', () => {
	// Both a function pointing at another function and one pointing at itself, since the self-reference is what
	// would trip the circular reference handling if a function were ever recursed into
	function a() {}
	a.foo = 'bar;';
	a.b = a;

	function b() {}
	b.other = a;

	const serialized = serializeError({a, b});

	assert.deepEqual(serialized, {});
	assert.equal(Object.hasOwn(serialized, 'a'), false);
	assert.equal(Object.hasOwn(serialized, 'b'), false);
});

test('should not access deep non-enumerable properties', () => {
	const error = new Error('some error');
	const object = {};
	Object.defineProperty(object, 'someProp', {
		enumerable: false,
		get() {
			throw new Error('some other error');
		},
	});
	error.object = object;
	assert.doesNotThrow(() => serializeError(error));
});

test('should not read a throwing getter the way `JSON.stringify` would not', () => {
	// The error property names are read from every value walked, not just errors, and from the prototype chain since
	// `name` lives on `Error.prototype`. `JSON.stringify()` reads neither a non-enumerable nor an inherited property,
	// so neither may this, or a getter on any of them takes the whole call down.
	const prototypeWith = property => {
		const prototype = {data: 'kept'};
		Object.defineProperty(prototype, property, {
			enumerable: false,
			get() {
				throw new Error(`boom ${property}`);
			},
		});

		return prototype;
	};

	for (const property of ['name', 'message', 'stack', 'code', 'cause', 'errors', 'someProp']) {
		const own = {data: 'kept'};
		Object.defineProperty(own, property, {
			enumerable: false,
			get: Object.getOwnPropertyDescriptor(prototypeWith(property), property).get,
		});

		const inherited = Object.create(prototypeWith(property));
		const label = `a throwing ${property} getter`;

		assert.doesNotThrow(() => serializeError({nested: own}), `serializeError must ignore ${label}`);
		assert.doesNotThrow(() => serializeError({nested: inherited}), `serializeError must ignore an inherited ${label}`);
		assert.doesNotThrow(() => deserializeError({message: 'root', nested: own}), `deserializeError must ignore ${label}`);
		assert.equal(isErrorLike(own), false, `isErrorLike must answer for ${label}, not throw`);

		// Whatever survives must still carry the data the object really had
		assert.equal(serializeError({nested: own}).nested.data, 'kept', `${label} must not lose the real properties`);
	}

	// An enumerable own getter is a different case. The regular property loop reads only keys `JSON.stringify()` also
	// reads, so a throwing one there propagates the same way it does natively. The six names are probed rather than
	// copied, so a failed probe drops the property instead of writing it as `undefined`.
	const enumerable = {
		data: 'kept',
		get name() {
			throw new Error('boom enumerable name');
		},
	};

	assert.throws(() => JSON.stringify({nested: enumerable}), {message: 'boom enumerable name'}, 'the control itself throws');
	assert.equal(serializeError({nested: enumerable}).nested.data, 'kept', 'a failed probe drops only that property');

	const ordinary = {
		get custom() {
			throw new Error('boom custom');
		},
	};

	assert.throws(() => serializeError({nested: ordinary}), {message: 'boom custom'}, 'an ordinary key still propagates');
});

test('should serialize nested errors', () => {
	const error = new Error('outer error');
	error.innerError = new Error('inner error');

	const serialized = serializeError(error);
	assert.equal(serialized.message, 'outer error');
	assert.equal(serialized.innerError.name, 'Error');
	assert.equal(serialized.innerError.message, 'inner error');
	assert.equal(serialized.innerError instanceof Error, false);
});

test('should serialize the cause property', () => {
	const error = new Error('outer error', {
		cause: new Error('inner error', {
			cause: new Error('deeper error'),
		}),
	});

	const serialized = serializeError(error);
	assert.equal(serialized.message, 'outer error');
	assert.equal(serialized.cause.name, 'Error');
	assert.equal(serialized.cause.message, 'inner error');
	assert.equal(serialized.cause.cause.name, 'Error');
	assert.equal(serialized.cause.cause.message, 'deeper error');
	assert.equal(serialized.cause instanceof Error, false);
	assert.equal(serialized.cause.cause instanceof Error, false);
});

test('should handle circular cause property', () => {
	const error = new Error('test');
	error.cause = error;

	const serialized = serializeError(error);
	assert.equal(serialized.message, 'test');
	assert.equal(serialized.cause, '[Circular]');
});

test('should handle circular errors property', () => {
	const error = new AggregateError([], 'test');
	error.errors.push(error);

	const serialized = serializeError(error);
	assert.equal(serialized.errors[0], '[Circular]');
});

test('should handle plain object cause with circular reference', () => {
	const circular = {};
	circular.self = circular;
	const error = new Error('test');
	error.cause = circular;

	const serialized = serializeError(error);
	assert.equal(serialized.cause.self, '[Circular]');
});

test('should serialize AggregateError', () => {
	// eslint-disable-next-line unicorn/error-message -- Testing this eventuality
	const error = new AggregateError([new Error('inner error')]);

	const serialized = serializeError(error);
	assert.equal(serialized.message, ''); // Default error message
	assert.equal(Array.isArray(serialized.errors), true);
	assert.equal(serialized.errors[0].name, 'Error');
	assert.equal(serialized.errors[0].message, 'inner error');
	assert.equal(serialized.errors[0] instanceof Error, false);
});

test('should serialize non-error values to NonError', () => {
	// `NonError` keeps the value in a non-enumerable property, so the message is the only place it survives
	// serialization. That makes the exact text the contract, not just the `Non-error value:` prefix.
	const cases = [
		['a string', 'hello', 'Non-error value: hello'],
		['a number', 42, 'Non-error value: 42'],
		['a boolean', true, 'Non-error value: true'],
		['a symbol', Symbol('test'), 'Non-error value: Symbol(test)'],
		['a bigint', 123n, 'Non-error value: 123n'],
		['a function', () => {}, 'Non-error value: <Function>'],
		['undefined', undefined, 'Non-error value: undefined'],
		['null', null, 'Non-error value: null'],
	];

	for (const [label, value, expectedMessage] of cases) {
		const serialized = serializeError(value);

		assert.equal(serialized.name, 'NonError', `${label} name`);
		assert.equal(serialized.message, expectedMessage, `${label} message`);
		assert.ok(serialized.stack, `${label} stack`);
	}
});

test('should deserialize non-error values to NonError', () => {
	const testValues = [null, 1, true, '123', [1], {}];
	for (const value of testValues) {
		deserializeNonError(value);
	}
});

test('should ignore Error instance', () => {
	const originalError = new Error('test');
	const deserialized = deserializeError(originalError);
	assert.equal(deserialized, originalError);
});

test('should deserialize a plain object into an error', () => {
	// A `message` is all that is required, and the name then falls back to the constructor's own
	const minimal = deserializeError({message: 'Stuff happened'});
	assert.equal(minimal instanceof Error, true);
	assert.equal(minimal.name, 'Error');
	assert.equal(minimal.message, 'Stuff happened');

	const object = {
		message: 'error message',
		stack: 'at <anonymous>:1:13',
		name: 'name',
		code: 'code',
	};

	const deserialized = deserializeError(object);
	assert.equal(deserialized instanceof Error, true);
	assert.equal(deserialized.message, 'error message');
	assert.equal(deserialized.stack, 'at <anonymous>:1:13');
	assert.equal(deserialized.name, 'name');
	assert.equal(deserialized.code, 'code');
});

test('should deserialize and preserve existing properties', () => {
	const deserialized = deserializeError({
		message: 'foo',
		customProperty: true,
	});
	assert.equal(deserialized instanceof Error, true);
	assert.equal(deserialized.message, 'foo');
	assert.equal(deserialized.customProperty, true);
});

test('should list error properties before custom ones, whatever their source order', () => {
	const error = new Error('m');
	error.custom = 1;
	error.code = 'E1';

	assert.deepEqual(Object.keys(serializeError(error)), ['name', 'message', 'stack', 'code', 'custom']);

	// Documented as a limitation, since the error property loop also runs on a nested plain object
	error.details = {id: 1, name: 'n', message: 'm'};
	assert.deepEqual(Object.keys(serializeError(error).details), ['name', 'message', 'id']);
});

test('should destroy each error property exactly once', () => {
	// Covers every name in `errorProperties`, which the property loop has to step aside for.
	// A plain object is used because reading an `Error`'s lazy `stack` re-reads `name` and `message`.
	for (const property of ['name', 'message', 'stack', 'code', 'cause', 'errors']) {
		let getterCalls = 0;
		let toJsonCalls = 0;

		const object = {message: 'outer'};
		Object.defineProperty(object, property, {
			enumerable: true,
			configurable: true,
			get() {
				getterCalls++;
				return {
					name: 'Error',
					message: 'inner',
					stack: 'st',
					toJSON() {
						toJsonCalls++;
						return {tick: toJsonCalls};
					},
				};
			},
		});

		serializeError(object);

		assert.equal(getterCalls, 1, `${property} getter calls`);
		assert.equal(toJsonCalls, 1, `${property} toJSON calls`);
	}
});

test('should not fail on a `toJSON` that is not idempotent', () => {
	let calls = 0;
	const error = new Error('outer');
	error.cause = {
		name: 'Error',
		message: 'inner',
		stack: 'st',
		toJSON() {
			calls++;
			if (calls > 1) {
				throw new Error('toJSON is not idempotent');
			}

			return {ok: true};
		},
	};

	assert.deepEqual(serializeError(error).cause, {ok: true});
});

test('should preserve buffers when deserializing', () => {
	const buffer = Buffer.from([1, 2, 3]);
	const deserialized = deserializeError({
		message: 'buffer',
		stack: '',
		data: buffer,
	});

	assert.equal(Buffer.isBuffer(deserialized.data), true);
	assert.equal(deserialized.data, buffer);
});

test('should preserve functions when deserializing', () => {
	const sideEffect = () => 'no-op';
	const deserialized = deserializeError({
		message: 'function',
		stack: '',
		callback: sideEffect,
	});

	assert.equal(deserialized.callback, sideEffect);
});

for (const property of ['cause', 'any']) {
	// `cause` is one of the error properties, so it is copied non-enumerable, while `any` is an ordinary key that
	// keeps the enumerability it arrived with. Both still have to turn a nested error-like value into a real `Error`.
	test(`should deserialize errors on the ${property} property`, () => {
		const object = {
			message: 'error message',
			stack: 'at <anonymous>:1:13',
			name: 'name',
			code: 'code',
			[property]: {
				message: 'source error message',
				stack: 'at <anonymous>:3:14',
				name: 'name',
				code: 'the apple',
				[property]: {
					message: 'original error message',
					stack: 'at <anonymous>:16:9',
					name: 'name',
					code: 'the snake',
				},
			},
		};

		const deserialized = deserializeError(object);
		assert.equal(Object.getOwnPropertyDescriptor(deserialized, property).enumerable, property === 'any');

		const {[property]: nested} = deserialized;
		assert.equal(nested instanceof Error, true);
		assert.equal(nested.message, 'source error message');
		assert.equal(nested.stack, 'at <anonymous>:3:14');
		assert.equal(nested.name, 'name');
		assert.equal(nested.code, 'the apple');

		const {[property]: deepNested} = nested;
		assert.equal(deepNested instanceof Error, true);
		assert.equal(deepNested.message, 'original error message');
		assert.equal(deepNested.stack, 'at <anonymous>:16:9');
		assert.equal(deepNested.name, 'name');
		assert.equal(deepNested.code, 'the snake');
	});
}

test('deserialized Error class properties should not be enumerable, other props should be', () => {
	const object = {
		message: 'error message',
		stack: 'at <anonymous>:1:13',
		name: 'name',
		cause: {
			message: 'cause error message',
			stack: 'at <anonymous>:4:20',
			name: 'name',
		},
	};

	const enumerables = {
		code: 'code',
		path: './path',
		errno: 1,
		syscall: 'syscall',
		randomProperty: 'random',
		notAnError: {
			stack: 'Not an error',
			cause: 'Wasn’t me',
		},
	};

	const deserialized = deserializeError({...object, ...enumerables});

	assert.deepEqual(Object.keys(enumerables), Object.keys(deserialized));

	assert.deepEqual(Object.keys(enumerables.notAnError), Object.keys(deserialized.notAnError));
});

test('should deserialize properties up to `Options.maxDepth` levels deep', () => {
	const error = new Error('errorMessage');
	const object = {
		message: error.message,
		name: error.name,
		stack: error.stack,
		one: {
			two: {
				three: {},
			},
		},
	};

	const levelZero = deserializeError(object, {maxDepth: 0});
	const emptyError = new Error('test');
	emptyError.message = '';
	assert.equal(levelZero instanceof Error, true);
	assert.deepEqual(levelZero, emptyError);

	const levelOne = deserializeError(object, {maxDepth: 1});
	error.one = {};
	assert.equal(levelOne instanceof Error, true);
	assert.deepEqual(levelOne, error);

	const levelTwo = deserializeError(object, {maxDepth: 2});
	error.one = {two: {}};
	assert.equal(levelTwo instanceof Error, true);
	assert.deepEqual(levelTwo, error);

	const levelThree = deserializeError(object, {maxDepth: 3});
	error.one = {two: {three: {}}};
	assert.equal(levelThree instanceof Error, true);
	assert.deepEqual(levelThree, error);
});

test('should deserialize AggregateError', () => {
	const deserialized = deserializeError({
		name: 'AggregateError',
		message: '',
		errors: [
			{name: 'Error', message: 'inner error', stack: ''},
		],
	});
	assert.equal(deserialized instanceof AggregateError, true);
	assert.equal(deserialized.message, '');
	assert.equal(Array.isArray(deserialized.errors), true);
	assert.equal(deserialized.errors[0].message, 'inner error');
	assert.equal(deserialized.errors[0] instanceof Error, true);
});

test('should ignore invalid error-like objects', () => {
	const errorLike = {
		name: 'Error',
		message: 'Some error message',
	};

	const nonErrorLike = {
		name: 'Error',
		message: (new class Message {}('Bottle')),
	};

	assert.equal(deserializeError(errorLike) instanceof Error, true);
	assert.equal(deserializeError(nonErrorLike) instanceof NonError, true);
});

test('should ignore nested invalid error-like objects', () => {
	const errorLike = {
		message: 'Base',
		nested: {
			name: 'Error',
			message: 'Some error message',
			stack: 'at <anonymous>:1:13',
		},
	};

	const nonErrorLike = {
		message: 'Base',
		nested: {
			name: 'Error',
			message: (new class Message {}('Bottle')),
			stack: 'at <anonymous>:1:13',
		},
	};

	assert.equal(deserializeError(errorLike).nested instanceof Error, true);
	assert.equal(deserializeError(nonErrorLike).nested instanceof Error, false);
});

test('should serialize Date as ISO string', () => {
	const date = {date: new Date(0)};
	const serialized = serializeError(date);
	assert.deepEqual(serialized, {date: '1970-01-01T00:00:00.000Z'});
});

test('should serialize custom error with `.toJSON`', () => {
	class CustomError extends Error {
		constructor() {
			super('foo');
			this.name = this.constructor.name;
			this.value = 10;
		}

		toJSON() {
			return {
				message: this.message,
				amount: `$${this.value}`,
			};
		}
	}

	const error = new CustomError();
	const serialized = serializeError(error);

	// The `toJSON()` result replaces the whole serialization, the error properties included
	assert.equal(serialized.message, 'foo');
	assert.equal(serialized.amount, '$10');
	assert.equal(Object.hasOwn(serialized, 'stack'), false, 'the stack must not survive a `toJSON()` result');
});

test('should retry `.toJSON` after it throws', () => {
	const error = new Error('original');
	const failure = new Error('temporary failure');
	let calls = 0;
	error.toJSON = () => {
		calls++;
		if (calls === 1) {
			throw failure;
		}

		return {message: 'custom JSON'};
	};

	assert.throws(() => serializeError(error), error => error === failure);
	assert.deepEqual(serializeError(error), {message: 'custom JSON'});
	assert.equal(calls, 2);
});

test('should serialize custom error with a property having `.toJSON`', () => {
	class CustomError extends Error {
		constructor(value) {
			super('foo');
			this.name = this.constructor.name;
			this.value = value;
		}
	}
	const value = {
		amount: 20,
		toJSON() {
			return {
				amount: `$${this.amount}`,
			};
		},
	};
	const error = new CustomError(value);
	const serialized = serializeError(error);
	const {stack, ...rest} = serialized;
	assert.deepEqual(rest, {
		message: 'foo',
		name: 'CustomError',
		value: {
			amount: '$20',
		},
	});
	assert.notEqual(stack, undefined);
});

test('should serialize custom error with `.toJSON` defined with `serializeError`', () => {
	class CustomError extends Error {
		constructor() {
			super('foo');
			this.name = this.constructor.name;
			this.value = 30;
		}

		toJSON() {
			return serializeError(this);
		}
	}
	const error = new CustomError();
	const serialized = serializeError(error);
	const {stack, ...rest} = serialized;
	assert.deepEqual(rest, {
		message: 'foo',
		name: 'CustomError',
		value: 30,
	});
	assert.notEqual(stack, undefined);
});

test('should ignore `.toJSON` methods if set in the options', () => {
	class CustomError extends Error {
		constructor() {
			super('foo');
			this.name = this.constructor.name;
			this.value = 10;
		}

		toJSON() {
			return {
				message: this.message,
				amount: `$${this.value}`,
			};
		}
	}

	const error = new CustomError();
	const serialized = serializeError(error, {useToJSON: false});
	assert.equal(serialized.name, 'CustomError');
	assert.equal(serialized.message, 'foo');
	assert.equal(serialized.value, 10);
	assert.ok(serialized.stack);
});

test('should serialize properties up to `Options.maxDepth` levels deep', () => {
	const error = new Error('errorMessage');
	error.one = {two: {three: {}}};
	const {message, name, stack} = error;

	const levelZero = serializeError(error, {maxDepth: 0});
	assert.deepEqual(levelZero, {});

	const levelOne = serializeError(error, {maxDepth: 1});
	assert.deepEqual(levelOne, {
		message, name, stack, one: {},
	});

	const levelTwo = serializeError(error, {maxDepth: 2});
	assert.deepEqual(levelTwo, {
		message, name, stack, one: {two: {}},
	});

	const levelThree = serializeError(error, {maxDepth: 3});
	assert.deepEqual(levelThree, {
		message, name, stack, one: {two: {three: {}}},
	});
});

test('should handle maxDepth consistently across sibling properties', () => {
	const error = new Error('test');
	error.a = {deep: {value: 'a'}};
	error.b = {deep: {value: 'b'}};
	error.c = {deep: {value: 'c'}};

	const serialized = serializeError(error, {maxDepth: 3});
	assert.equal(serialized.a.deep.value, 'a');
	assert.equal(serialized.b.deep.value, 'b');
	assert.equal(serialized.c.deep.value, 'c');

	const deserialized = deserializeError({
		message: 'test',
		a: {deep: {value: 'a'}},
		b: {deep: {value: 'b'}},
		c: {deep: {value: 'c'}},
	}, {maxDepth: 3});
	assert.equal(deserialized.a.deep.value, 'a');
	assert.equal(deserialized.b.deep.value, 'b');
	assert.equal(deserialized.c.deep.value, 'c');
});

test('should identify serialized errors', () => {
	assert.equal(isErrorLike(serializeError(new Error('I’m missing more than just your body'))), true);
	// eslint-disable-next-line unicorn/error-message -- Testing this eventuality
	assert.equal(isErrorLike(serializeError(new Error())), true);
	assert.equal(isErrorLike({
		name: 'Error',
		message: 'Is it too late now to say sorry',
		stack: 'at <anonymous>:3:14',
	}), true);

	assert.equal(isErrorLike({
		name: 'Bluberricious pancakes',
		stack: 12,
		ingredients: 'Blueberry',
	}), false);

	assert.equal(isErrorLike({
		name: 'Edwin Monton',
		message: 'We’ve been trying to reach you about your car’s extended warranty',
		medium: 'Glass bottle in ocean',
	}), false);
});

test('should serialize custom non-extensible error with custom `.toJSON` property', () => {
	class CustomError extends Error {
		constructor() {
			super('foo');
			this.name = this.constructor.name;
		}

		toJSON() {
			return this;
		}
	}

	const error = Object.preventExtensions(new CustomError());
	const serialized = serializeError(error);
	const {stack, ...rest} = serialized;
	assert.deepEqual(rest, {
		name: 'CustomError',
		message: 'foo',
	});

	assert.notEqual(stack, undefined);
	assert.notEqual(serialized, error);
});

if ('DOMException' in globalThis) {
	test('should serialize DOMException', () => {
		const serialized = serializeError(new DOMException('x'));
		assert.equal(serialized.message, 'x');
	});

	test('should deep clone DOMException when it is in the cause property', () => {
		const domException = new DOMException('My domException', 'NotFoundError');
		const error = new Error('My error message', {
			cause: domException,
		});

		const serialized = serializeError(error);

		assert.equal(serialized.message, 'My error message');
		assert.equal(serialized.cause.message, 'My domException');
		assert.equal(serialized.cause.name, 'NotFoundError');
		assert.equal(serialized.cause.code, 8);
		// Should be a deep clone, not the same reference
		assert.notEqual(serialized.cause, domException);
		assert.equal(serialized.cause instanceof DOMException, false);
		assert.equal(serialized.cause instanceof Error, false);
	});
}

test('should read each enumerable property exactly once', () => {
	let reads = 0;
	const object = {message: 'm'};
	Object.defineProperty(object, 'lazy', {
		enumerable: true,
		get() {
			reads++;
			return 'value';
		},
	});

	assert.equal(serializeError(object).lazy, 'value');
	assert.equal(reads, 1);
});

test('should preserve streams by reference when deserializing', () => {
	const stream = new Stream.Readable();
	const deserialized = deserializeError({message: 'stream', stack: '', stream});

	assert.equal(deserialized.stream, stream);
});

test('should preserve the error type through a full JSON round trip', () => {
	const original = new TypeError('bad', {cause: new RangeError('deep')});
	// eslint-disable-next-line unicorn/prefer-structured-clone -- The JSON round trip is what is being tested
	const deserialized = deserializeError(JSON.parse(JSON.stringify(serializeError(original))));

	assert.equal(deserialized instanceof TypeError, true);
	assert.equal(deserialized.message, 'bad');
	assert.equal(deserialized.cause instanceof RangeError, true);
	assert.equal(deserialized.cause.message, 'deep');
});

test('should restore errors nested in arrays', () => {
	const deserialized = deserializeError({
		message: 'm',
		list: [
			{name: 'Error', message: 'a', stack: 's'},
			{name: 'TypeError', message: 'b', stack: 's'},
		],
	});

	assert.equal(Array.isArray(deserialized.list), true);
	assert.equal(deserialized.list[0] instanceof Error, true);
	assert.equal(deserialized.list[1] instanceof TypeError, true);
});

test('should fall back to a plain `Error` for an unknown constructor name', () => {
	const deserialized = deserializeError({name: 'SomeUnknownError', message: 'm', stack: 's'});

	assert.equal(deserialized.constructor, Error);
	assert.equal(deserialized.name, 'SomeUnknownError');
});

test('should apply `maxDepth` to the `cause` chain', () => {
	const error = new Error('a', {cause: new Error('b', {cause: new Error('c')})});

	assert.deepEqual(serializeError(error, {maxDepth: 0}), {});

	// Each `cause` level costs one depth, same as any other property
	assert.deepEqual(serializeError(error, {maxDepth: 1}).cause, {});
	assert.equal(serializeError(error, {maxDepth: 2}).cause.message, 'b');
	assert.deepEqual(serializeError(error, {maxDepth: 2}).cause.cause, {});
	assert.equal(serializeError(error, {maxDepth: 3}).cause.cause.message, 'c');
});

test('should replace a Buffer held by an error property with `[object Buffer]`', () => {
	// A Buffer in any other position already becomes `[object Buffer]`. Held directly by an error property it used
	// to keep its own JSON form, such as `{type: 'Buffer', data: []}`, or become `{}` when truncated by `maxDepth`.
	for (const property of ['name', 'message', 'stack', 'code', 'cause', 'errors']) {
		for (const maxDepth of [undefined, 1, 2]) {
			const error = new Error('m');
			error[property] = Buffer.from([1, 2]);

			const options = maxDepth === undefined ? {} : {maxDepth};
			const label = `${property} at maxDepth ${String(maxDepth)}`;

			assert.equal(serializeError(error, options)[property], '[object Buffer]', label);
		}
	}
});

test('should keep an error property explicitly set to `null`', () => {
	// `null` survives `JSON.stringify`, unlike `undefined`, so dropping it would lose data on the wire
	for (const property of ['name', 'code', 'cause', 'errors']) {
		const error = new Error('m');
		error[property] = null;

		const serialized = serializeError(error);
		assert.equal(Object.hasOwn(serialized, property), true, `${property} is present`);
		assert.equal(serialized[property], null, `${property} is null`);
	}
});

test('should keep a non-enumerable error property set to `null`', () => {
	// The constructor option and `deserializeError()` both set `cause` as non-enumerable, which is still deliberate
	assert.equal(serializeError(new Error('m', {cause: null})).cause, null, 'set through the constructor');

	const payload = {
		name: 'Error',
		message: 'm',
		stack: 's',
		cause: null,
		errors: null,
	};

	const roundTripped = serializeError(deserializeError(payload));
	assert.deepEqual(roundTripped, payload, 'a round trip keeps it');
});

test('should still skip an error property that was never set', () => {
	const serialized = serializeError(new Error('m'));

	for (const property of ['code', 'cause', 'errors']) {
		assert.equal(Object.hasOwn(serialized, property), false, `${property} is absent`);
	}
});

test('should serialize a top-level array as an array', () => {
	const serialized = serializeError([new Error('a'), new Error('b')]);

	assert.equal(Array.isArray(serialized), true);
	assert.equal(serialized[0].message, 'a');
	assert.equal(serialized[1].message, 'b');
});

test('should wrap an array in a `NonError` when deserializing, since arrays are not errors', () => {
	const deserialized = deserializeError([1, 2]);

	assert.equal(deserialized instanceof NonError, true);
	assert.deepEqual(deserialized.value, [1, 2]);
});

test('should round-trip every primitive through `NonError`', () => {
	const values = [undefined, null, true, false, 0, -1, Number.NaN, '', 'text', 123n, Symbol('s'), () => {}];

	for (const value of values) {
		const serialized = serializeError(value);
		assert.equal(serialized.name, 'NonError', `name for ${String(value)}`);

		// Through actual JSON, since that is the path a serialized error travels and the only reason the value ends
		// up in the message at all, as `NonError` holds it in a non-enumerable property
		// eslint-disable-next-line unicorn/prefer-structured-clone -- The JSON round trip is what is being tested
		const wire = JSON.parse(JSON.stringify(serialized));
		const deserialized = deserializeError(wire);
		assert.equal(deserialized instanceof NonError, true, `instance for ${String(value)}`);
		assert.equal(deserialized.message, serialized.message, `message for ${String(value)}`);
	}
});

test('should not share references with the original object', () => {
	const shared = {value: 1};
	const error = new Error('m');
	error.first = shared;
	error.second = shared;

	const serialized = serializeError(error);
	assert.notEqual(serialized.first, shared);
	assert.notEqual(serialized.second, shared);

	serialized.first.value = 2;
	assert.equal(shared.value, 1);
});

test('should not mutate the value given to `deserializeError`', () => {
	const cause = {name: 'Error', message: 'inner', stack: 's'};
	const payload = {message: 'm', cause, list: [1, 2]};
	const snapshot = JSON.stringify(payload);

	deserializeError(payload);

	assert.equal(JSON.stringify(payload), snapshot);
	assert.equal(payload.cause, cause);
});

test('should not leave a reference to the input in the result', () => {
	const shared = {value: 1};
	const error = new Error('m', {cause: new Error('c')});
	error.first = shared;
	error.second = shared;

	const serialized = serializeError(error);

	const walk = value => {
		if (!value || typeof value !== 'object') {
			return false;
		}

		if (value === error || value === shared) {
			return true;
		}

		return Object.values(value).some(item => walk(item));
	};

	assert.equal(walk(serialized), false);
});

test('should let a `toJSON` that re-enters `serializeError` terminate', () => {
	let calls = 0;
	const inner = {
		message: 'inner',
		toJSON() {
			calls++;
			// Re-entering on the same value is what the reentrancy guard has to break. Without it this would call
			// itself again on the way back in, forever.
			return serializeError(this);
		},
	};

	// The same object appears twice, so the guard has to let the second occurrence through as well
	const outer = {message: 'm', first: inner, second: inner};
	const serialized = serializeError(outer);

	assert.equal(serialized.first.message, 'inner');
	assert.equal(serialized.second.message, 'inner');
	assert.equal(serialized.first instanceof Error, false, 'the re-entering result is handed back as a plain object');
	assert.notEqual(serialized.first, serialized.second, 'each occurrence gets its own result');
	assert.equal(calls, 2, 'one call per occurrence, so the recursion was cut short');
});

test('should allow a later `toJSON` call after an earlier one threw', () => {
	let calls = 0;
	const value = {
		toJSON() {
			calls++;
			if (calls === 1) {
				throw new Error('first call fails');
			}

			return {ok: true};
		},
	};

	assert.throws(() => serializeError({value}), {message: 'first call fails'});
	assert.deepEqual(serializeError({value}).value, {ok: true});
});

test('should not call `toJSON` on a nested value when `useToJSON` is off', () => {
	let calls = 0;
	const value = {
		toJSON() {
			calls++;
			return {replaced: true};
		},
	};

	const serialized = serializeError({value}, {useToJSON: false});

	assert.equal(calls, 0);
	assert.deepEqual(serialized.value, {});
	assert.equal(serializeError({value}).value.replaced, true);
});

test('should deserialize an error-like payload for any combination of options', () => {
	const payload = {
		name: 'TypeError',
		message: 'm',
		stack: 's',
		code: 'E',
		cause: {name: 'RangeError', message: 'c', stack: 'cs'},
	};

	for (const maxDepth of [undefined, 0, 1, 2, Number.POSITIVE_INFINITY]) {
		for (const useToJSON of [undefined, true, false]) {
			const options = {};
			if (maxDepth !== undefined) {
				options.maxDepth = maxDepth;
			}

			if (useToJSON !== undefined) {
				options.useToJSON = useToJSON;
			}

			const deserialized = deserializeError(payload, options);
			const label = `maxDepth=${maxDepth} useToJSON=${useToJSON}`;

			assert.equal(deserialized instanceof TypeError, true, label);

			// At depth 0 nothing is copied, so the error keeps the values it was constructed with
			if (maxDepth === 0) {
				assert.equal(deserialized.message, '', label);
				assert.equal(Object.hasOwn(deserialized, 'cause'), false, label);
			} else {
				assert.equal(deserialized.message, 'm', label);
				assert.equal(deserialized.code, 'E', label);
				assert.equal(deserialized.cause instanceof RangeError, true, label);
				assert.equal(deserialized.cause.message, maxDepth === 1 ? '' : 'c', label);
				if (maxDepth !== 1) {
					assert.equal(deserialized.cause.stack, 'cs', label);
				}
			}
		}
	}
});

for (const [name, CustomError] of errorConstructors) {
	test(`should deserialize and preserve the ${name} constructor`, () => {
		const deserialized = deserializeError({
			name,
			message: 'foo',
		});
		assert.equal(deserialized instanceof CustomError, true);
		assert.equal(deserialized.message, 'foo');
	});
}

test('should not allow adding incompatible or redundant error constructors', () => {
	assert.throws(() => {
		addKnownErrorConstructor(Error);
	}, {message: 'Error constructor "Error" is already known'});
	assert.throws(() => {
		addKnownErrorConstructor(class BadError {
			constructor() {
				throw new Error('The number you have dialed is not in service');
			}
		});
	}, {message: 'Constructor "BadError" is not compatible'});
});

test('should run the documented `addKnownErrorConstructor` examples', () => {
	// The readme and type definitions show these exact calls, so they must not throw
	class MyError extends Error {
		name = 'ReadmeMyError';
	}

	addKnownErrorConstructor(MyError);

	class CustomError extends Error {
		name = 'ReadmeCustomError';

		constructor(message, options) {
			super(message);
			this.code = options.code;
		}
	}

	addKnownErrorConstructor(CustomError, () => new CustomError('', {code: 'ERR_UNICORN'}));

	assert.equal(deserializeError({name: 'ReadmeMyError', message: 'm'}) instanceof MyError, true);
	assert.equal(deserializeError({name: 'ReadmeCustomError', message: 'm'}).code, 'ERR_UNICORN');
});

test('should not allow registering a factory that returns a non-extensible error', () => {
	// A frozen or sealed instance cannot take the payload's properties, so it could never deserialize anything
	class FrozenError extends Error {
		name = 'FrozenError';
	}

	class SealedError extends Error {
		name = 'SealedError';
	}

	for (const [ErrorConstructor, makeNonExtensible] of [[FrozenError, Object.freeze], [SealedError, Object.seal], [FrozenError, Object.preventExtensions]]) {
		assert.throws(() => {
			addKnownErrorConstructor(ErrorConstructor, () => makeNonExtensible(new ErrorConstructor()));
		}, {message: 'Constructor must produce an extensible instance'}, `${ErrorConstructor.name} through ${makeNonExtensible.name}`);
	}

	assert.equal(errorConstructors.has('FrozenError'), false);
	assert.equal(errorConstructors.has('SealedError'), false);
});

// `Error.isError()` is only available on newer engines, and the fallback can be faked by design
test('should not allow registering a class that only fakes the `Error` brand', {skip: !Error.isError}, () => {
	class FakeError {
		name = 'FakeError';
		message = 'm';
		stack = 's';

		get [Symbol.toStringTag]() {
			return 'Error';
		}
	}

	assert.equal(Object.prototype.toString.call(new FakeError()), '[object Error]');
	assert.throws(() => {
		addKnownErrorConstructor(FakeError);
	}, {message: 'Constructor must produce an instance of `Error`'});
});

test('should allow registering a legacy constructor that only inherits from `Error.prototype`', () => {
	// `Error.isError()` rejects such an instance, since it was never created by `Error`
	function LegacyError(message) {
		this.name = 'LegacyError';
		this.message = message;
	}

	inherits(LegacyError, Error);
	addKnownErrorConstructor(LegacyError);

	const deserialized = deserializeError({name: 'LegacyError', message: 'm', code: 'E1'});
	assert.equal(deserialized instanceof LegacyError, true);
	assert.equal(deserialized.message, 'm');
	assert.equal(deserialized.code, 'E1');
});

test('should allow registering an error class from another realm', () => {
	// `instanceof` is realm-bound, so an error created in a `vm` context is not an instance of this realm's `Error`
	const CrossRealmError = vm.runInNewContext(`
		(class CrossRealmError extends Error {
			constructor(message) {
				super(message);
				this.name = 'CrossRealmError';
			}
		})
	`);

	assert.equal(new CrossRealmError('m') instanceof Error, false);

	addKnownErrorConstructor(CrossRealmError);

	const deserialized = deserializeError({
		name: 'CrossRealmError',
		message: 'm',
		stack: 's',
		errors: ['a'],
	});

	assert.equal(deserialized instanceof CrossRealmError, true);
	assert.equal(deserialized.message, 'm');

	// Recognizing the constructor is only half of it. Deciding whether the result gets the error properties is a
	// separate check, and when that one was realm-bound the result came out fully enumerable instead of an error.
	assert.deepEqual(deserialized.errors, ['a']);
	assert.deepEqual(Object.keys(deserialized), []);
	for (const property of ['name', 'message', 'stack', 'errors']) {
		assert.equal(Object.getOwnPropertyDescriptor(deserialized, property).enumerable, false, `${property} must not be enumerable`);
	}
});

test('should not allow registering a constructor that does not produce an `Error`', () => {
	class NotAnError {
		constructor() {
			this.name = 'NotAnError1';
			this.message = 'm';
			this.stack = 's';
		}
	}

	assert.throws(() => {
		addKnownErrorConstructor(NotAnError);
	}, {message: 'Constructor must produce an instance of `Error`'});

	assert.throws(() => {
		addKnownErrorConstructor(NotAnError, () => new NotAnError());
	}, {message: 'Constructor must produce an instance of `Error`'});
});

test('should wrap a throwing `name` getter when registering a constructor', () => {
	class ThrowingNameError extends Error {
		get name() {
			throw new Error('name getter boom');
		}
	}

	assert.throws(() => {
		addKnownErrorConstructor(ThrowingNameError);
	}, {message: 'Constructor "ThrowingNameError" is not compatible'});

	assert.throws(() => {
		addKnownErrorConstructor(ThrowingNameError, () => new ThrowingNameError());
	}, {message: 'Factory is not compatible'});
});

test('should validate the constructor parameter', () => {
	const invalidConstructors = [
		['undefined', undefined],
		['null', null],
		['string', 'Error'],
		['number', 42],
		['object', {}],
	];

	for (const [label, constructor] of invalidConstructors) {
		assert.throws(() => {
			addKnownErrorConstructor(constructor);
		}, {message: 'Constructor must be a function'}, `${label} without factory`);

		assert.throws(() => {
			addKnownErrorConstructor(constructor, () => new Error('test'));
		}, {message: 'Constructor must be a function'}, `${label} with factory`);
	}
});

test('should not allow registering an error constructor named `NonError`', () => {
	// `newError()` always returns a real `NonError` for this name, so a registration would be silently ignored
	class NonErrorish extends Error {
		name = 'NonError';
	}

	assert.throws(() => {
		addKnownErrorConstructor(NonErrorish);
	}, {message: /"NonError" is reserved/});
});

test('should handle minified constructors correctly using instance name', () => {
	class CustomError extends Error {
		name = 'CustomError';

		constructor(message) { // eslint-disable-line no-useless-constructor
			super(message);
		}
	}

	// Simulate minification by changing constructor name
	Object.defineProperty(CustomError, 'name', {
		value: 'a', // Minified name
		configurable: true,
	});

	addKnownErrorConstructor(CustomError);

	const error = new CustomError('test message');
	const serialized = serializeError(error);
	assert.equal(serialized.name, 'CustomError');

	const deserialized = deserializeError(serialized);
	assert.equal(deserialized instanceof CustomError, true);
	assert.equal(deserialized.name, 'CustomError');
	assert.equal(deserialized.message, 'test message');
});

test('should support factory functions for incompatible constructors', () => {
	class SpecialError extends Error {
		name = 'SpecialError';

		constructor(message, options = {}) {
			super(message);
			this.code = options.code || 'UNKNOWN';
			this.severity = options.severity || 'low';
		}
	}

	addKnownErrorConstructor(SpecialError, () => new SpecialError('', {code: 'DEFAULT', severity: 'high'}));

	const original = new SpecialError('Something went wrong', {code: 'CUSTOM', severity: 'critical'});
	const serialized = serializeError(original);

	const deserialized = deserializeError(serialized);

	assert.equal(deserialized instanceof SpecialError, true);
	assert.equal(deserialized.name, 'SpecialError');
	assert.equal(deserialized.message, 'Something went wrong');
	assert.equal(deserialized.code, 'CUSTOM');
	assert.equal(deserialized.severity, 'critical');
});

test('should validate factory functions', () => {
	class MyError extends Error {
		name = 'MyError';
	}

	class OtherError extends Error {
		name = 'OtherError';
	}

	assert.throws(() => {
		addKnownErrorConstructor(MyError, () => {
			throw new Error('Factory failed');
		});
	}, {message: 'Factory is not compatible'});

	assert.throws(() => {
		addKnownErrorConstructor(MyError, () => new OtherError());
	}, {message: /must return an instance of/});
});

test('should validate factory parameter types', () => {
	class TestError extends Error {
		name = 'TestError';
	}

	const invalidFactories = [
		['string', 'not a function'],
		['number', 42],
		['object', {}],
	];

	for (const [label, invalidFactory] of invalidFactories) {
		assert.throws(() => {
			addKnownErrorConstructor(TestError, invalidFactory);
		}, {message: /must be a function/}, `${label} factory`);
	}
});

test('should validate error instance names', () => {
	class NoNameError extends Error {
		name = undefined; // Explicitly set to undefined
	}

	assert.throws(() => {
		addKnownErrorConstructor(NoNameError);
	}, {message: /must have a non-empty string "name" property/});

	class EmptyNameError extends Error {
		name = '';
	}

	assert.throws(() => {
		addKnownErrorConstructor(EmptyNameError);
	}, {message: /must have a non-empty string "name" property/});

	class NumberNameError extends Error {
		name = 42;
	}

	assert.throws(() => {
		addKnownErrorConstructor(NumberNameError);
	}, {message: /must have a non-empty string "name" property/});
});

test('should throw when factory fails during deserialization', () => {
	let callCount = 0;

	class UnreliableError extends Error {
		name = 'UnreliableError';
	}

	addKnownErrorConstructor(UnreliableError, () => {
		callCount++;
		if (callCount > 1) {
			throw new Error('Factory failure during deserialization');
		}

		return new UnreliableError();
	});

	assert.throws(() => {
		deserializeError({
			name: 'UnreliableError',
			message: 'test',
		});
	}, {message: 'Factory failure during deserialization'});
});

test('should provide helpful error messages', () => {
	class TestError extends Error {
		name = 'TestError';
	}

	addKnownErrorConstructor(TestError);

	assert.throws(() => {
		addKnownErrorConstructor(TestError);
	}, {message: /TestError.*already known/});
});

test('should handle minified constructor names in error messages', () => {
	class MinifiedError extends Error {
		name = 'MinifiedErrorUnique';
	}

	Object.defineProperty(MinifiedError, 'name', {
		value: 'a',
		configurable: true,
	});

	addKnownErrorConstructor(MinifiedError);

	class AnotherMinifiedError extends Error {
		name = 'MinifiedErrorUnique'; // Same resolved name
	}

	Object.defineProperty(AnotherMinifiedError, 'name', {
		value: 'b',
		configurable: true,
	});

	assert.throws(() => {
		addKnownErrorConstructor(AnotherMinifiedError);
	}, {message: 'Error constructor "MinifiedErrorUnique" is already known'});
});

// Deterministic generator, so a failure is always reproducible from the seed.
const createRandom = seed => {
	let state = seed;
	return () => {
		state = ((state * 1_103_515_245) + 12_345) % 2_147_483_648;
		return state / 2_147_483_648;
	};
};

// A leaf that is not a number, so every primitive branch of `destroyValue()` gets exercised rather than only the
// default float. A symbol and a function are here because both are dropped or replaced rather than copied.
const randomLeaf = random => {
	const roll = random();
	if (roll < 0.6) {
		return random();
	}

	if (roll < 0.7) {
		return 'text';
	}

	if (roll < 0.75) {
		return null;
	}

	if (roll < 0.8) {
		return undefined;
	}

	if (roll < 0.85) {
		return true;
	}

	if (roll < 0.9) {
		return 123n;
	}

	if (roll < 0.95) {
		return Symbol('leaf');
	}

	// An anonymous arrow still gives `typeof value === 'function'`, which is the branch being exercised
	return () => 'leaf';
};

const randomValue = (random, depth, pool) => {
	const roll = random();
	if (depth <= 0 || roll < 0.3) {
		return randomLeaf(random);
	}

	if (roll < 0.4) {
		return Array.from({length: Math.floor(random() * 3)}, () => randomValue(random, depth - 1, pool));
	}

	if (roll < 0.43) {
		return new Date(0);
	}

	if (roll < 0.46) {
		return Buffer.from([1, 2]);
	}

	if (roll < 0.49) {
		return new Map([['k', 1]]);
	}

	if (roll < 0.52) {
		return new Stream.Readable();
	}

	// Reusing a pooled object builds shared graphs without creating cycles
	if (random() < 0.3 && pool.length > 0) {
		return pool[Math.floor(random() * pool.length)];
	}

	const object = {};
	for (const key of ['message', 'name', 'stack', 'code', 'cause', 'errors', 'a', 'b']) {
		if (random() < 0.5) {
			object[key] = randomValue(random, depth - 1, pool);
		}
	}

	if (random() < 0.2) {
		object.self = object;
	}

	pool.push(object);
	return object;
};

// Cycle-safe snapshot, since the generated input deliberately contains cycles and values JSON cannot express.
const snapshotOf = value => {
	const seen = new WeakSet();
	return JSON.stringify(value, (key, item) => {
		if (typeof item === 'bigint' || typeof item === 'symbol' || typeof item === 'function') {
			return String(item);
		}

		if (item !== null && typeof item === 'object') {
			if (seen.has(item)) {
				return '[Circular]';
			}

			seen.add(item);
		}

		return item;
	}) ?? '<unserializable>';
};

// Every prototype the library can put on a value it builds. A payload must never be able to introduce another one.
const libraryPrototypes = new Set([
	Object.prototype,
	Array.prototype,
	NonError.prototype,
	...Array.from(errorConstructors.values(), constructor => constructor.prototype),
]);

// The graph the library builds has no cycles, since `seen` replaces each one with the `'[Circular]'` string.
// Walks every own property rather than `Object.values()`, since a deserialized error keeps `cause` and `errors` non-enumerable, and a walk that skipped them would never check what is nested there.
const eachObject = function * (value) {
	if (value === null || typeof value !== 'object') {
		return;
	}

	yield value;

	for (const key of Object.getOwnPropertyNames(value)) {
		yield * eachObject(value[key]);
	}
};

test('should never throw, mutate its input, or break `JSON.stringify` on generated input', () => {
	// These invariants cover every fix in this package. Keep the iteration count low enough for CI.
	for (let seed = 1; seed <= 300; seed++) {
		const random = createRandom(seed);
		const input = randomValue(random, 3, []);
		const snapshot = snapshotOf(input);

		const serialized = serializeError(input);
		assert.equal(snapshotOf(input), snapshot, `seed ${seed}: input must not be mutated`);

		// The whole point of the package
		assert.doesNotThrow(() => JSON.stringify(serialized), `seed ${seed}: result must be JSON-safe`);

		// `JSON.parse` makes `__proto__` an own key, so a result must never gain a replaced prototype.
		// A `Date` or `Buffer` serializes to a string through `toJSON()`, and an array stays an array, so only an
		// object result is checked, and both plain prototypes are valid.
		if (serialized !== null && typeof serialized === 'object') {
			const prototype = Object.getPrototypeOf(serialized);
			assert.equal(prototype === Object.prototype || prototype === Array.prototype, true, `seed ${seed}: prototype must be a plain one`);
		}

		for (const maxDepth of [0, 1, 2, Number.POSITIVE_INFINITY]) {
			const truncated = serializeError(input, {maxDepth});
			assert.doesNotThrow(() => JSON.stringify(truncated), `seed ${seed}: maxDepth ${maxDepth} must be JSON-safe`);
		}
	}
});

test('should never throw on, or corrupt, hostile JSON payloads', () => {
	const NAMES = ['Error', 'TypeError', 'AggregateError', 'DOMException', 'NonError', 'Weird', '__proto__', 'constructor'];
	const KEYS = ['message', 'name', 'stack', 'code', 'cause', 'errors', '__proto__', 'constructor', 'prototype'];

	// Whatever a payload could reach through a prototype, recorded before anything runs
	const baseline = [Object.prototype, Array.prototype]
		.map(prototype => Object.getOwnPropertyNames(prototype).sort().join(','));

	for (let seed = 1; seed <= 300; seed++) {
		const random = createRandom(seed);
		const build = depth => {
			if (depth <= 0 || random() < 0.4) {
				return JSON.stringify(random() < 0.5 ? NAMES[Math.floor(random() * NAMES.length)] : 'nested');
			}

			const parts = [];
			for (let i = 0; i < 1 + Math.floor(random() * 4); i++) {
				parts.push(`${JSON.stringify(KEYS[Math.floor(random() * KEYS.length)])}:${build(depth - 1)}`);
			}

			return `{${parts.join(',')}}`;
		};

		// Always an object carrying a string `message`, so this exercises the reconstruction path. The `NonError`
		// wrapper hands the payload straight back, so it would prove nothing about what the library builds, and a
		// second `message` key would make the first a duplicate that `JSON.parse()` drops.
		const topLevel = ['"message":"m"'];
		for (let i = 0; i < 1 + Math.floor(random() * 4); i++) {
			const key = KEYS[Math.floor(random() * KEYS.length)];
			if (key !== 'message') {
				topLevel.push(`${JSON.stringify(key)}:${build(4)}`);
			}
		}

		const result = deserializeError(JSON.parse(`{${topLevel.join(',')}}`));
		const label = `seed ${seed}`;

		assert.equal(result instanceof Error, true, `${label}: must deserialize to an Error`);

		for (const node of eachObject(result)) {
			const prototype = Object.getPrototypeOf(node);

			// Assigning a payload `__proto__` key replaces the prototype instead of adding a property, which silently
			// turns the whole result into a plain object that is no longer an `Error`
			assert.equal(libraryPrototypes.has(prototype), true, `${label}: prototype must be one the library chose, got ${prototype?.constructor?.name}`);

			assert.equal(Object.hasOwn(node, '__proto__'), false, `${label}: __proto__ must be dropped, not copied`);
		}
	}

	for (const [index, prototype] of [Object.prototype, Array.prototype].entries()) {
		assert.equal(Object.getOwnPropertyNames(prototype).sort().join(','), baseline[index], `${prototype.constructor.name} must be unchanged`);
	}
});

class WritablePropertiesError extends Error {
	name = 'WritablePropertiesError';

	constructor() {
		super();
		for (const property of ['code', 'details']) {
			Object.defineProperty(this, property, {
				value: 'constructor default',
				enumerable: true,
				writable: true,
			});
		}
	}
}

addKnownErrorConstructor(WritablePropertiesError);

test('deserialization updates writable non-configurable error properties with converted values', () => {
	const nested = {name: 'RangeError', message: 'inner', stack: 'inner stack'};
	const result = deserializeError({
		name: 'WritablePropertiesError', message: 'outer', code: nested, details: nested,
	});

	assert.ok(result instanceof WritablePropertiesError);
	assert.ok(result.code instanceof RangeError);
	assert.ok(result.details instanceof RangeError);
	assert.equal(result.code.message, 'inner');
	assert.notEqual(result.code, nested);
	assert.notEqual(result.code, result.details);
	assert.deepEqual(Object.getOwnPropertyDescriptor(result, 'code'), {
		value: result.code,
		enumerable: true,
		configurable: false,
		writable: true,
	});
});

test('deserialization leaves read-only non-configurable properties unchanged', () => {
	class ReadOnlyPropertiesError extends Error {
		name = 'ReadOnlyPropertiesError';

		constructor() {
			super();
			for (const property of ['code', 'details']) {
				Object.defineProperty(this, property, {value: 'read only'});
			}
		}
	}

	addKnownErrorConstructor(ReadOnlyPropertiesError);
	const result = deserializeError({
		name: 'ReadOnlyPropertiesError', message: 'outer', code: {value: 1}, details: {value: 2},
	});

	assert.equal(result.message, 'outer');
	for (const property of ['code', 'details']) {
		assert.equal(result[property], 'read only');
		assert.equal(Object.getOwnPropertyDescriptor(result, property).writable, false);
	}
});

test('function values behave consistently on error properties and regular properties', () => {
	const callback = () => 'callback';
	const result = deserializeError({
		name: 'WritablePropertiesError', message: 'outer', code: callback, details: callback,
	});

	assert.equal(result.code, callback);
	assert.equal(result.details, callback);

	const serialized = serializeError(result);
	assert.equal(Object.hasOwn(serialized, 'code'), false);
	assert.equal(Object.hasOwn(serialized, 'details'), false);
});

test('depth limits apply equally to writable error properties and regular properties', () => {
	const shared = {nested: {value: 1}};
	const payload = {
		name: 'WritablePropertiesError', message: 'outer', code: shared, details: shared,
	};

	for (const [maxDepth, expected] of [[0, 'constructor default'], [1, {}], [2, {nested: {}}], [3, shared]]) {
		const result = deserializeError(payload, {maxDepth});
		assert.deepEqual(result.code, expected);
		assert.deepEqual(result.details, expected);
		if (maxDepth > 0) {
			assert.notEqual(result.code, shared);
			assert.notEqual(result.code, result.details);
		}
	}
});

test('prototype keys are skipped without invoking their getters', () => {
	const nested = {value: 1};
	Object.defineProperty(nested, '__proto__', {
		enumerable: true,
		get() {
			throw new Error('prototype key must not be read');
		},
	});

	const payload = {message: 'outer', code: nested, details: nested};
	for (const convert of [serializeError, deserializeError]) {
		const result = convert(payload);
		for (const property of ['code', 'details']) {
			assert.deepEqual(result[property], {value: 1});
			assert.equal(Object.getPrototypeOf(result[property]), Object.prototype);
			assert.equal(Object.hasOwn(result[property], '__proto__'), false);
		}
	}
});

test('a self-returning toJSON still removes cycles and copies shared references separately', () => {
	const value = {
		message: 'inner',
		toJSON() {
			return this;
		},
	};
	value.cause = value;
	const result = serializeError({first: value, second: value});

	assert.deepEqual(result, {
		first: {message: 'inner', cause: '[Circular]'},
		second: {message: 'inner', cause: '[Circular]'},
	});
	assert.notEqual(result.first, value);
	assert.notEqual(result.first, result.second);
	assert.equal(value.cause, value);
	assert.doesNotThrow(() => JSON.stringify(result));
});
