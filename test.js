import test from 'ava';
import serializeError from '.';

test('main', t => {
	const serialized = serializeError(new Error('foo'));
	const keys = Object.keys(serialized);
	t.true(keys.includes('name'));
	t.true(keys.includes('stack'));
	t.true(keys.includes('message'));
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
		}
	});
	error.object = object;
	t.notThrows(() => serializeError(error));
});

test('should serialize nested errors', t => {
	const error = new Error('outer error');
	error.innerError = new Error('inner error');

	const serialized = serializeError(error);
	t.is(serialized.message, 'outer error');
	t.is(serialized.innerError.message, 'inner error');
});

test('should respect maxDepth option', t => {
	const error = new Error('nested error');
	error.response = {
		headers: {
			contentType: 'application/json'
		},
		data: 'Hello, world'
	};

	const serializedOneDeep = serializeError(error, {maxDepth: 1});
	t.is(serializedOneDeep.message, 'nested error');
	t.deepEqual(serializedOneDeep.response, {});

	const serializedTwoDeep = serializeError(error, {maxDepth: 2});
	t.deepEqual(serializedTwoDeep.response, {data: 'Hello, world', headers: {}});
});
