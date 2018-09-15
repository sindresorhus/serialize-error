import test from 'ava';
import m from '.';

test(t => {
	const serialized = m(new Error('foo'));
	const x = Object.keys(serialized);
	t.not(x.indexOf('name'), -1);
	t.not(x.indexOf('stack'), -1);
	t.not(x.indexOf('message'), -1);
});

test('should destroy circular references', t => {
	const obj = {};
	obj.child = {parent: obj};

	const serialized = m(obj);
	t.is(typeof serialized, 'object');
	t.is(serialized.child.parent, '[Circular]');
});

test('should not affect the original object', t => {
	const obj = {};
	obj.child = {parent: obj};

	const serialized = m(obj);
	t.not(serialized, obj);
	t.is(obj.child.parent, obj);
});

test('should only destroy parent references', t => {
	const obj = {};
	const common = {thing: obj};
	obj.one = {firstThing: common};
	obj.two = {secondThing: common};

	const serialized = m(obj);
	t.is(typeof serialized.one.firstThing, 'object');
	t.is(typeof serialized.two.secondThing, 'object');
	t.is(serialized.one.firstThing.thing, '[Circular]');
	t.is(serialized.two.secondThing.thing, '[Circular]');
});

test('should work on arrays', t => {
	const obj = {};
	const common = [obj];
	const x = [common];
	const y = [['test'], common];
	y[0][1] = y;
	obj.a = {x};
	obj.b = {y};

	const serialized = m(obj);
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
	const obj = {a};

	const serialized = m(obj);
	t.deepEqual(serialized, {});
});

test('should replace top-level functions with a helpful string', t => {
	function a() {}
	function b() {}
	a.b = b;

	const serialized = m(a);
	t.is(serialized, '[Function: a]');
});

test('should drop functions', t => {
	function a() {}
	a.foo = 'bar;';
	a.b = a;
	const obj = {a};

	const serialized = m(obj);
	t.deepEqual(serialized, {});
	t.false(Object.prototype.hasOwnProperty.call(serialized, 'a'));
});

test('should not access deep non-enumerable properties', t => {
	const error = new Error('some error');
	const obj = {};
	Object.defineProperty(obj, 'someProp', {
		enumerable: false,
		get() {
			throw new Error('some other error');
		}
	});
	error.obj = obj;
	t.notThrows(() => m(error));
});

test('should serialize nested errors', t => {
	const error = new Error('outer error');
	error.innerError = new Error('inner error');

	const serialized = m(error);
	t.is(serialized.message, 'outer error');
	t.is(serialized.innerError.message, 'inner error');
});
