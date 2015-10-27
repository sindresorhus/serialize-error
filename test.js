import test from 'ava';
import fn from './';

test(t => {
	const x = Object.keys(fn(new Error('foo')));
	t.true(x.includes('name'));
	t.true(x.includes('stack'));
	t.true(x.includes('message'));
	t.end();
});
