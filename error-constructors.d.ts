/**
Map of error constructors to recreate from the serialize `name` property. If the name is not found in this map, the errors will be deserialized as simple `Error` instances.
*/
declare const errorConstructors: Map<string, ErrorConstructor>;

export default errorConstructors;
