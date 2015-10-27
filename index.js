'use strict';
module.exports = function (err) {
	var ret = {
		name: err.name
	};

	Object.getOwnPropertyNames(err).forEach(function (key) {
		ret[key] = err[key];
	});

	// these gets added on native errors in Node.js for some reason
	if (ret.type === undefined) {
		delete ret.type;
	}

	if (ret.arguments === undefined) {
		delete ret.arguments;
	}

	return ret;
};
