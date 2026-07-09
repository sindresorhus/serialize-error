import {Buffer} from 'node:buffer';
import Stream from 'node:stream';
import test from 'ava';
import {errorConstructors, addKnownErrorConstructor} from './error-constructors.js';
import {
	serializeError,
	deserializeError,
	isErrorLike,
	NonError,
} from './index.js';

function deserializeNonError(t, value) {
	const deserialized = deserializeError(value);
	t.true(deserialized instanceof Error);
	t.is(deserialized.constructor.name, 'NonError');
	t.regex(deserialized.message, /^Non-error value:/);
}

test('main', t => {
	const serialized = serializeError(new Error('foo'));
	const properties = Object.keys(serialized);

	t.true(properties.includes('name'));
	t.true(properties.includes('stack'));
	t.true(properties.includes('message'));
});

test('should destroy circular references', t => {
	const object = {};
	object.child = {parent: object};

	const serialized = serializeError(object);
	t.is(typeof serialized, 'object');
	t.is(serialized.child.parent, '[Circular]');
});

test('should not affect the original object', t => {
	const object = {};
	object.child = {parent: object};

	const serialized = serializeError(object);
	t.not(serialized, object);
	t.is(object.child.parent, object);
});

test('should only destroy parent references', t => {
	const object = {};
	const common = {thing: object};
	object.one = {firstThing: common};
	object.two = {secondThing: common};

	const serialized = serializeError(object);
	t.is(typeof serialized.one.firstThing, 'object');
	t.is(typeof serialized.two.secondThing, 'object');
	t.is(serialized.one.firstThing.thing, '[Circular]');
	t.is(serialized.two.secondThing.thing, '[Circular]');
});

test('should work on arrays', t => {
	const object = {};
	const common = [object];
	const x = [common];
	const y = [['test'], common];
	y[0][1] = y;
	object.a = {x};
	object.b = {y};

	const serialized = serializeError(object);
	t.true(Array.isArray(serialized.a.x));
	t.is(serialized.a.x[0][0], '[Circular]');
	t.is(serialized.b.y[0][0], 'test');
	t.is(serialized.b.y[1][0], '[Circular]');
	t.is(serialized.b.y[0][1], '[Circular]');
});

test('should discard nested functions', t => {
	function a() {}
	function b() {}
	a.b = b;
	const object = {a};

	const serialized = serializeError(object);
	t.deepEqual(serialized, {});
});

test('should discard buffers', t => {
	const object = {a: Buffer.alloc(1)};
	const serialized = serializeError(object);
	t.deepEqual(serialized, {a: '[object Buffer]'});
});

test('should serialize BigInt as string', t => {
	const error = new Error('test');
	error.bigNumber = 123_456_789_012_345_678_901n;
	const serialized = serializeError(error);
	t.is(serialized.bigNumber, '123456789012345678901n');
	t.notThrows(() => JSON.stringify(serialized));
});

test('should discard streams', t => {
	t.deepEqual(serializeError({s: new Stream.Stream()}), {s: '[object Stream]'}, 'Stream.Stream');
	t.deepEqual(serializeError({s: new Stream.Readable()}), {s: '[object Stream]'}, 'Stream.Readable');
	t.deepEqual(serializeError({s: new Stream.Writable()}), {s: '[object Stream]'}, 'Stream.Writable');
	t.deepEqual(serializeError({s: new Stream.Duplex()}), {s: '[object Stream]'}, 'Stream.Duplex');
	t.deepEqual(serializeError({s: new Stream.Transform()}), {s: '[object Stream]'}, 'Stream.Transform');
	t.deepEqual(serializeError({s: new Stream.PassThrough()}), {s: '[object Stream]'}, 'Stream.PassThrough');
});

test('should drop functions', t => {
	function a() {}
	a.foo = 'bar;';
	a.b = a;
	const object = {a};

	const serialized = serializeError(object);
	t.deepEqual(serialized, {});
	t.false(Object.hasOwn(serialized, 'a'));
});

test('should not access deep non-enumerable properties', t => {
	const error = new Error('some error');
	const object = {};
	Object.defineProperty(object, 'someProp', {
		enumerable: false,
		get() {
			throw new Error('some other error');
		},
	});
	error.object = object;
	t.notThrows(() => serializeError(error));
});

test('should serialize nested errors', t => {
	const error = new Error('outer error');
	error.innerError = new Error('inner error');

	const serialized = serializeError(error);
	t.is(serialized.message, 'outer error');
	t.like(serialized.innerError, {
		name: 'Error',
		message: 'inner error',
	});
	t.false(serialized.innerError instanceof Error);
});

test('should serialize the cause property', t => {
	const error = new Error('outer error', {
		cause: new Error('inner error', {
			cause: new Error('deeper error'),
		}),
	});

	const serialized = serializeError(error);
	t.is(serialized.message, 'outer error');
	t.like(serialized.cause, {
		name: 'Error',
		message: 'inner error',
		cause: {
			name: 'Error',
			message: 'deeper error',
		},
	});
	t.false(serialized.cause instanceof Error);
	t.false(serialized.cause.cause instanceof Error);
});

test('should handle circular cause property', t => {
	const error = new Error('test');
	error.cause = error;

	const serialized = serializeError(error);
	t.is(serialized.message, 'test');
	t.is(serialized.cause, '[Circular]');
});

test('should handle circular errors property', t => {
	const error = new AggregateError([], 'test');
	error.errors.push(error);

	const serialized = serializeError(error);
	t.is(serialized.errors[0], '[Circular]');
});

test('should handle plain object cause with circular reference', t => {
	const circular = {};
	circular.self = circular;
	const error = new Error('test');
	error.cause = circular;

	const serialized = serializeError(error);
	t.is(serialized.cause.self, '[Circular]');
});

test('should serialize AggregateError', t => {
	// eslint-disable-next-line unicorn/error-message -- Testing this eventuality
	const error = new AggregateError([new Error('inner error')]);

	const serialized = serializeError(error);
	t.is(serialized.message, ''); // Default error message
	t.true(Array.isArray(serialized.errors));
	t.like(serialized.errors[0], {
		name: 'Error',
		message: 'inner error',
	});
	t.false(serialized.errors[0] instanceof Error);
});

test('should serialize non-error values to NonError', t => {
	// String
	const stringResult = serializeError('hello');
	t.is(stringResult.name, 'NonError');
	t.regex(stringResult.message, /^Non-error value:/);
	t.truthy(stringResult.stack);

	// Number
	const numberResult = serializeError(42);
	t.is(numberResult.name, 'NonError');
	t.regex(numberResult.message, /^Non-error value:/);
	t.truthy(numberResult.stack);

	// Boolean
	const booleanResult = serializeError(true);
	t.is(booleanResult.name, 'NonError');
	t.regex(booleanResult.message, /^Non-error value:/);
	t.truthy(booleanResult.stack);

	// Symbol
	const symbolResult = serializeError(Symbol('test'));
	t.is(symbolResult.name, 'NonError');
	t.regex(symbolResult.message, /^Non-error value:/);
	t.truthy(symbolResult.stack);

	// BigInt
	const bigIntResult = serializeError(BigInt(123));
	t.is(bigIntResult.name, 'NonError');
	t.regex(bigIntResult.message, /^Non-error value:/);
	t.truthy(bigIntResult.stack);

	// Function
	const functionResult = serializeError(() => {});
	t.is(functionResult.name, 'NonError');
	t.regex(functionResult.message, /^Non-error value:/);
	t.truthy(functionResult.stack);

	// Undefined
	const undefinedResult = serializeError(undefined);
	t.is(undefinedResult.name, 'NonError');
	t.regex(undefinedResult.message, /^Non-error value:/);
	t.truthy(undefinedResult.stack);

	// Null
	const nullResult = serializeError(null);
	t.is(nullResult.name, 'NonError');
	t.regex(nullResult.message, /^Non-error value:/);
	t.truthy(nullResult.stack);
});

test('should deserialize non-error values to NonError', t => {
	const testValues = [null, 1, true, '123', [1], {}];
	for (const value of testValues) {
		deserializeNonError(t, value);
	}
});

test('should round-trip serialized non-errors to NonError', t => {
	const serialized = serializeError('hello');
	const deserialized = deserializeError(serialized);

	t.true(deserialized instanceof NonError);
	t.is(deserialized.name, 'NonError');
	t.regex(deserialized.message, /^Non-error value:/);
	t.truthy(deserialized.stack);
});

test('should ignore Error instance', t => {
	const originalError = new Error('test');
	const deserialized = deserializeError(originalError);
	t.is(deserialized, originalError);
});

test('should deserialize error', t => {
	const deserialized = deserializeError({
		message: 'Stuff happened',
	});
	t.true(deserialized instanceof Error);
	t.is(deserialized.name, 'Error');
	t.is(deserialized.message, 'Stuff happened');
});

test('should deserialize and preserve existing properties', t => {
	const deserialized = deserializeError({
		message: 'foo',
		customProperty: true,
	});
	t.true(deserialized instanceof Error);
	t.is(deserialized.message, 'foo');
	t.true(deserialized.customProperty);
});

for (const [name, CustomError] of errorConstructors) {
	test(`should deserialize and preserve the ${name} constructor`, t => {
		const deserialized = deserializeError({
			name,
			message: 'foo',
		});
		t.true(deserialized instanceof CustomError);
		t.is(deserialized.message, 'foo');
	});
}

test('should not allow adding incompatible or redundant error constructors', t => {
	t.throws(() => {
		addKnownErrorConstructor(Error);
	}, {message: 'Error constructor "Error" is already known'});
	t.throws(() => {
		addKnownErrorConstructor(class BadError {
			constructor() {
				throw new Error('The number you have dialed is not in service');
			}
		});
	}, {message: 'Constructor "BadError" is not compatible'});
});

test('should handle minified constructors correctly using instance name', t => {
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
	t.is(serialized.name, 'CustomError');

	const deserialized = deserializeError(serialized);
	t.true(deserialized instanceof CustomError);
	t.is(deserialized.name, 'CustomError');
	t.is(deserialized.message, 'test message');
});

test('should support factory functions for incompatible constructors', t => {
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

	t.true(deserialized instanceof SpecialError);
	t.is(deserialized.name, 'SpecialError');
	t.is(deserialized.message, 'Something went wrong');
	t.is(deserialized.code, 'CUSTOM');
	t.is(deserialized.severity, 'critical');
});

test('should validate factory functions', t => {
	class MyError extends Error {
		name = 'MyError';
	}

	class OtherError extends Error {
		name = 'OtherError';
	}

	t.throws(() => {
		addKnownErrorConstructor(MyError, () => {
			throw new Error('Factory failed');
		});
	}, {message: 'Factory is not compatible'});

	t.throws(() => {
		addKnownErrorConstructor(MyError, () => new OtherError());
	}, {message: /must return an instance of/});
});

test('should validate factory parameter types', t => {
	class TestError extends Error {
		name = 'TestError';
	}

	const invalidFactories = ['not a function', 42, {}];
	for (const invalidFactory of invalidFactories) {
		t.throws(() => {
			addKnownErrorConstructor(TestError, invalidFactory);
		}, {message: /must be a function/});
	}
});

test('should validate error instance names', t => {
	class NoNameError extends Error {
		name = undefined; // Explicitly set to undefined
	}

	t.throws(() => {
		addKnownErrorConstructor(NoNameError);
	}, {message: /must have a non-empty string "name" property/});

	class EmptyNameError extends Error {
		name = '';
	}

	t.throws(() => {
		addKnownErrorConstructor(EmptyNameError);
	}, {message: /must have a non-empty string "name" property/});

	class NumberNameError extends Error {
		name = 42;
	}

	t.throws(() => {
		addKnownErrorConstructor(NumberNameError);
	}, {message: /must have a non-empty string "name" property/});
});

test('should throw when factory fails during deserialization', t => {
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

	t.throws(() => {
		deserializeError({
			name: 'UnreliableError',
			message: 'test',
		});
	}, {message: 'Factory failure during deserialization'});
});

test('should provide helpful error messages', t => {
	class TestError extends Error {
		name = 'TestError';
	}

	addKnownErrorConstructor(TestError);

	t.throws(() => {
		addKnownErrorConstructor(TestError);
	}, {message: /TestError.*already known/});
});

test('should handle minified constructor names in error messages', t => {
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

	t.throws(() => {
		addKnownErrorConstructor(AnotherMinifiedError);
	}, {message: 'Error constructor "MinifiedErrorUnique" is already known'});
});

test('should deserialize plain object', t => {
	const object = {
		message: 'error message',
		stack: 'at <anonymous>:1:13',
		name: 'name',
		code: 'code',
	};

	const deserialized = deserializeError(object);
	t.is(deserialized instanceof Error, true);
	t.is(deserialized.message, 'error message');
	t.is(deserialized.stack, 'at <anonymous>:1:13');
	t.is(deserialized.name, 'name');
	t.is(deserialized.code, 'code');
});

test('should wrap deserialized errors as cause with a current stack', t => {
	const deserialized = deserializeError({
		name: 'TypeError',
		message: 'error message',
		stack: 'serialized stack',
		code: 'code',
	}, {asCause: true});

	t.true(deserialized instanceof TypeError);
	t.is(deserialized.name, 'TypeError');
	t.is(deserialized.message, 'error message');
	t.is(deserialized.code, undefined);
	t.true(deserialized.cause instanceof TypeError);
	t.is(deserialized.cause.message, 'error message');
	t.is(deserialized.cause.stack, 'serialized stack');
	t.is(deserialized.cause.code, 'code');
	t.false(Object.keys(deserialized).includes('cause'));
	t.not(deserialized.stack, 'serialized stack');
	t.regex(deserialized.stack, /test\.js/);
	t.false(deserialized.stack.includes('wrapAsCause'));
});

test('should wrap deserialized errors with custom constructors', t => {
	class WrappedCustomError extends Error {
		name = 'WrappedCustomError';
	}

	addKnownErrorConstructor(WrappedCustomError);

	const deserialized = deserializeError({
		name: 'WrappedCustomError',
		message: 'custom error message',
		stack: 'serialized custom stack',
	}, {asCause: true});

	t.true(deserialized instanceof WrappedCustomError);
	t.is(deserialized.message, 'custom error message');
	t.true(deserialized.cause instanceof WrappedCustomError);
	t.is(deserialized.cause.message, 'custom error message');
	t.is(deserialized.cause.stack, 'serialized custom stack');
});

test('should wrap existing Error instances when requested', t => {
	const error = new RangeError('existing error');
	const deserialized = deserializeError(error, {asCause: true});

	t.true(deserialized instanceof RangeError);
	t.is(deserialized.message, 'existing error');
	t.is(deserialized.cause, error);
	t.not(deserialized, error);
});

test('should preserve buffers when deserializing', t => {
	const buffer = Buffer.from([1, 2, 3]);
	const deserialized = deserializeError({
		message: 'buffer',
		stack: '',
		data: buffer,
	});

	t.true(Buffer.isBuffer(deserialized.data));
	t.is(deserialized.data, buffer);
});

test('should preserve functions when deserializing', t => {
	const sideEffect = () => 'no-op';
	const deserialized = deserializeError({
		message: 'function',
		stack: '',
		callback: sideEffect,
	});

	t.is(deserialized.callback, sideEffect);
});

for (const property of ['cause', 'any']) {
	// `cause` is treated differently from other properties in the code
	test(`should deserialize errors on ${property} property`, t => {
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

		const {[property]: nested} = deserializeError(object);
		t.true(nested instanceof Error);
		t.is(nested.message, 'source error message');
		t.is(nested.stack, 'at <anonymous>:3:14');
		t.is(nested.name, 'name');
		t.is(nested.code, 'the apple');

		const {[property]: deepNested} = nested;
		t.true(deepNested instanceof Error);
		t.is(deepNested.message, 'original error message');
		t.is(deepNested.stack, 'at <anonymous>:16:9');
		t.is(deepNested.name, 'name');
		t.is(deepNested.code, 'the snake');
	});
}

test('deserialized Error class properties should not be enumerable, other props should be', t => {
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

	t.deepEqual(
		Object.keys(enumerables),
		Object.keys(deserialized),
	);

	t.deepEqual(
		Object.keys(enumerables.notAnError),
		Object.keys(deserialized.notAnError),
	);
});

test('should deserialize properties up to `Options.maxDepth` levels deep', t => {
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
	t.is(levelZero instanceof Error, true);
	t.deepEqual(levelZero, emptyError);

	const levelOne = deserializeError(object, {maxDepth: 1});
	error.one = {};
	t.is(levelOne instanceof Error, true);
	t.deepEqual(levelOne, error);

	const levelTwo = deserializeError(object, {maxDepth: 2});
	error.one = {two: {}};
	t.is(levelTwo instanceof Error, true);
	t.deepEqual(levelTwo, error);

	const levelThree = deserializeError(object, {maxDepth: 3});
	error.one = {two: {three: {}}};
	t.is(levelThree instanceof Error, true);
	t.deepEqual(levelThree, error);
});

test('should deserialize AggregateError', t => {
	const deserialized = deserializeError({
		name: 'AggregateError',
		message: '',
		errors: [
			{name: 'Error', message: 'inner error', stack: ''},
		],
	});
	t.true(deserialized instanceof AggregateError);
	t.is(deserialized.message, '');
	t.true(Array.isArray(deserialized.errors));
	t.is(deserialized.errors[0].message, 'inner error');
	t.true(deserialized.errors[0] instanceof Error);
});

test('should ignore invalid error-like objects', t => {
	const errorLike = {
		name: 'Error',
		message: 'Some error message',
	};

	const nonErrorLike = {
		name: 'Error',
		message: (new class Message {}('Bottle')),
	};

	t.true(deserializeError(errorLike) instanceof Error);
	t.true(deserializeError(nonErrorLike) instanceof NonError);
});

test('should ignore nested invalid error-like objects', t => {
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

	t.true(deserializeError(errorLike).nested instanceof Error);
	t.false(deserializeError(nonErrorLike).nested instanceof Error);
});

test('should serialize Date as ISO string', t => {
	const date = {date: new Date(0)};
	const serialized = serializeError(date);
	t.deepEqual(serialized, {date: '1970-01-01T00:00:00.000Z'});
});

test('should serialize custom error with `.toJSON`', t => {
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
	t.deepEqual(serialized, {
		message: 'foo',
		amount: '$10',
	});
	t.true(serialized.stack === undefined);
});

test('should serialize custom error with a property having `.toJSON`', t => {
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
	t.deepEqual(rest, {
		message: 'foo',
		name: 'CustomError',
		value: {
			amount: '$20',
		},
	});
	t.not(stack, undefined);
});

test('should serialize custom error with `.toJSON` defined with `serializeError`', t => {
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
	t.deepEqual(rest, {
		message: 'foo',
		name: 'CustomError',
		value: 30,
	});
	t.not(stack, undefined);
});

test('should ignore `.toJSON` methods if set in the options', t => {
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
	t.like(serialized, {
		name: 'CustomError',
		message: 'foo',
		value: 10,
	});
	t.truthy(serialized.stack);
});

test('should serialize properties up to `Options.maxDepth` levels deep', t => {
	const error = new Error('errorMessage');
	error.one = {two: {three: {}}};
	const {message, name, stack} = error;

	const levelZero = serializeError(error, {maxDepth: 0});
	t.deepEqual(levelZero, {});

	const levelOne = serializeError(error, {maxDepth: 1});
	t.deepEqual(levelOne, {
		message, name, stack, one: {},
	});

	const levelTwo = serializeError(error, {maxDepth: 2});
	t.deepEqual(levelTwo, {
		message, name, stack, one: {two: {}},
	});

	const levelThree = serializeError(error, {maxDepth: 3});
	t.deepEqual(levelThree, {
		message, name, stack, one: {two: {three: {}}},
	});
});

test('should handle maxDepth consistently across sibling properties', t => {
	const error = new Error('test');
	error.a = {deep: {value: 'a'}};
	error.b = {deep: {value: 'b'}};
	error.c = {deep: {value: 'c'}};

	const serialized = serializeError(error, {maxDepth: 3});
	t.is(serialized.a.deep.value, 'a');
	t.is(serialized.b.deep.value, 'b');
	t.is(serialized.c.deep.value, 'c');

	const deserialized = deserializeError({
		message: 'test',
		a: {deep: {value: 'a'}},
		b: {deep: {value: 'b'}},
		c: {deep: {value: 'c'}},
	}, {maxDepth: 3});
	t.is(deserialized.a.deep.value, 'a');
	t.is(deserialized.b.deep.value, 'b');
	t.is(deserialized.c.deep.value, 'c');
});

test('should identify serialized errors', t => {
	t.true(isErrorLike(serializeError(new Error('I’m missing more than just your body'))));
	// eslint-disable-next-line unicorn/error-message -- Testing this eventuality
	t.true(isErrorLike(serializeError(new Error())));
	t.true(isErrorLike({
		name: 'Error',
		message: 'Is it too late now to say sorry',
		stack: 'at <anonymous>:3:14',
	}));

	t.false(isErrorLike({
		name: 'Bluberricious pancakes',
		stack: 12,
		ingredients: 'Blueberry',
	}));

	t.false(isErrorLike({
		name: 'Edwin Monton',
		message: 'We’ve been trying to reach you about your car’s extended warranty',
		medium: 'Glass bottle in ocean',
	}));
});

test('should serialize custom non-extensible error with custom `.toJSON` property', t => {
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
	t.deepEqual(rest, {
		name: 'CustomError',
	});

	t.not(stack, undefined);
});

if ('DOMException' in globalThis) {
	test('should serialize DOMException', t => {
		const serialized = serializeError(new DOMException('x'));
		t.is(serialized.message, 'x');
	});

	test('should deep clone DOMException when it is in the cause property', t => {
		const domException = new DOMException('My domException', 'NotFoundError');
		const error = new Error('My error message', {
			cause: domException,
		});

		const serialized = serializeError(error);

		t.is(serialized.message, 'My error message');
		t.is(serialized.cause.message, 'My domException');
		t.is(serialized.cause.name, 'NotFoundError');
		t.is(serialized.cause.code, 8);
		// Should be a deep clone, not the same reference
		t.not(serialized.cause, domException);
		t.false(serialized.cause instanceof DOMException);
		t.false(serialized.cause instanceof Error);
	});
}
