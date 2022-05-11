import {Buffer} from 'node:buffer';
import Stream from 'node:stream';
import test from 'ava';
import errorConstructors from './error-constructors.js';
import {serializeError, deserializeError, isErrorLike} from './index.js';

function deserializeNonError(t, value) {
	const deserialized = deserializeError(value);
	t.true(deserialized instanceof Error);
	t.is(deserialized.constructor.name, 'NonError');
	t.is(deserialized.message, JSON.stringify(value));
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

test('should discard streams', t => {
	t.deepEqual(serializeError({s: new Stream.Stream()}), {s: '[object Stream]'}, 'Stream.Stream');
	t.deepEqual(serializeError({s: new Stream.Readable()}), {s: '[object Stream]'}, 'Stream.Readable');
	t.deepEqual(serializeError({s: new Stream.Writable()}), {s: '[object Stream]'}, 'Stream.Writable');
	t.deepEqual(serializeError({s: new Stream.Duplex()}), {s: '[object Stream]'}, 'Stream.Duplex');
	t.deepEqual(serializeError({s: new Stream.Transform()}), {s: '[object Stream]'}, 'Stream.Transform');
	t.deepEqual(serializeError({s: new Stream.PassThrough()}), {s: '[object Stream]'}, 'Stream.PassThrough');
});

test('should replace top-level functions with a helpful string', t => {
	function a() {}
	function b() {}
	a.b = b;

	const serialized = serializeError(a);
	t.is(serialized, '[Function: a]');
});

test('should drop functions', t => {
	function a() {}
	a.foo = 'bar;';
	a.b = a;
	const object = {a};

	const serialized = serializeError(object);
	t.deepEqual(serialized, {});
	t.false(Object.prototype.hasOwnProperty.call(serialized, 'a'));
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
	const error = new Error('outer error');
	// TODO: Replace with plain `new Error('outer', {cause: new Error('inner')})` when targeting Node 16.9+
	Object.defineProperty(error, 'cause', {
		value: new Error('inner error'),
		enumerable: false,
		writable: true,
	});

	const serialized = serializeError(error);
	t.is(serialized.message, 'outer error');
	t.like(serialized.cause, {
		name: 'Error',
		message: 'inner error',
	});
	t.false(serialized.cause instanceof Error);
});

test('should handle top-level null values', t => {
	const serialized = serializeError(null);
	t.is(serialized, null);
});

test('should deserialize null', t => {
	deserializeNonError(t, null);
});

test('should deserialize number', t => {
	deserializeNonError(t, 1);
});

test('should deserialize boolean', t => {
	deserializeNonError(t, true);
});

test('should deserialize string', t => {
	deserializeNonError(t, '123');
});

test('should deserialize array', t => {
	deserializeNonError(t, [1]);
});

test('should deserialize error', t => {
	const deserialized = deserializeError(new Error('test'));
	t.true(deserialized instanceof Error);
	t.is(deserialized.message, 'test');
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
				code: 'code',
			},
		};

		const {[property]: nested} = deserializeError(object);
		t.true(nested instanceof Error);
		t.is(nested.message, 'source error message');
		t.is(nested.stack, 'at <anonymous>:3:14');
		t.is(nested.name, 'name');
		t.is(nested.code, 'code');
	});
}

test('deserialized name, stack, cause and message should not be enumerable, other props should be', t => {
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
	};

	const deserialized = deserializeError({...object, ...enumerables});

	t.deepEqual(
		Object.keys(enumerables),
		Object.keys(deserialized),
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
	t.deepEqual(levelOne, {message, name, stack, one: {}});

	const levelTwo = serializeError(error, {maxDepth: 2});
	t.deepEqual(levelTwo, {message, name, stack, one: {two: {}}});

	const levelThree = serializeError(error, {maxDepth: 3});
	t.deepEqual(levelThree, {message, name, stack, one: {two: {three: {}}}});
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
