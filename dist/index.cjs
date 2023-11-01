var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var src_exports = {};
__export(src_exports, {
  NonError: () => NonError,
  deserializeError: () => deserializeError,
  errorConstructors: () => import_error_constructors2.default,
  isErrorLike: () => isErrorLike,
  serializeError: () => serializeError
});
module.exports = __toCommonJS(src_exports);
var import_error_constructors = __toESM(require('./error-constructors.cjs'), 1);
var import_error_constructors2 = __toESM(require('./error-constructors.cjs'), 1);
class NonError extends Error {
  name = "NonError";
  constructor(message) {
    super(NonError._prepareSuperMessage(message));
  }
  static _prepareSuperMessage(message) {
    try {
      return JSON.stringify(message);
    } catch {
      return String(message);
    }
  }
}
const commonProperties = [
  {
    property: "name",
    enumerable: false
  },
  {
    property: "message",
    enumerable: false
  },
  {
    property: "stack",
    enumerable: false
  },
  {
    property: "code",
    enumerable: true
  },
  {
    property: "cause",
    enumerable: false
  }
];
const toJsonWasCalled = /* @__PURE__ */ new WeakSet();
const toJSON = (from) => {
  toJsonWasCalled.add(from);
  const json = from.toJSON();
  toJsonWasCalled.delete(from);
  return json;
};
const getErrorConstructor = (name) => import_error_constructors.default.get(name) ?? Error;
const destroyCircular = ({ from, seen, to, forceEnumerable, maxDepth, depth, useToJSON, serialize }) => {
  if (!to) {
    if (Array.isArray(from)) {
      to = [];
    } else if (!serialize && isErrorLike(from)) {
      const Error2 = getErrorConstructor(from.name);
      to = new Error2();
    } else {
      to = {};
    }
  }
  seen.push(from);
  if (depth >= maxDepth) {
    return to;
  }
  if (useToJSON && typeof from.toJSON === "function" && !toJsonWasCalled.has(from)) {
    return toJSON(from);
  }
  const continueDestroyCircular = (value) => destroyCircular({
    from: value,
    seen: [...seen],
    forceEnumerable,
    maxDepth,
    depth,
    useToJSON,
    serialize
  });
  for (const [key, value] of Object.entries(from)) {
    if (typeof Buffer === "function" && Buffer.isBuffer(value)) {
      to[key] = "[object Buffer]";
      continue;
    }
    if (value !== null && typeof value === "object" && typeof value.pipe === "function") {
      to[key] = "[object Stream]";
      continue;
    }
    if (typeof value === "function") {
      continue;
    }
    if (!value || typeof value !== "object") {
      try {
        to[key] = value;
      } catch {
      }
      continue;
    }
    if (!seen.includes(from[key])) {
      depth++;
      to[key] = continueDestroyCircular(from[key]);
      continue;
    }
    to[key] = "[Circular]";
  }
  for (const { property, enumerable } of commonProperties) {
    if (typeof from[property] !== "undefined" && from[property] !== null) {
      Object.defineProperty(to, property, {
        value: isErrorLike(from[property]) ? continueDestroyCircular(from[property]) : from[property],
        enumerable: forceEnumerable ? true : enumerable,
        configurable: true,
        writable: true
      });
    }
  }
  return to;
};
function serializeError(value, options = {}) {
  const { maxDepth = Number.POSITIVE_INFINITY, useToJSON = true } = options;
  if (typeof value === "object" && value !== null) {
    return destroyCircular({
      from: value,
      seen: [],
      forceEnumerable: true,
      maxDepth,
      depth: 0,
      useToJSON,
      serialize: true
    });
  }
  if (typeof value === "function") {
    return `[Function: ${value.name || "anonymous"}]`;
  }
  return value;
}
function deserializeError(value, options = {}) {
  const { maxDepth = Number.POSITIVE_INFINITY } = options;
  if (value instanceof Error) {
    return value;
  }
  if (isMinimumViableSerializedError(value)) {
    const Error2 = getErrorConstructor(value.name);
    return destroyCircular({
      from: value,
      seen: [],
      to: new Error2(),
      maxDepth,
      depth: 0,
      serialize: false
    });
  }
  return new NonError(value);
}
function isErrorLike(value) {
  return Boolean(value) && typeof value === "object" && "name" in value && "message" in value && "stack" in value;
}
function isMinimumViableSerializedError(value) {
  return Boolean(value) && typeof value === "object" && "message" in value && !Array.isArray(value);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  NonError,
  deserializeError,
  errorConstructors,
  isErrorLike,
  serializeError
});
//# sourceMappingURL=index.cjs.map