import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
	mode: "production",
	entry: "./index.js",
	output: {
		path: path.resolve(__dirname, "dist"),
		filename: "serialize-error-browser.js",
	},
	module: {
		rules: [
			{
				test: /\.js$/,
				loader: "expose-loader",
				type: "javascript/auto",
				options: {
					exposes: [
						{
							globalName: "serializeError",
							moduleLocalName: "serializeError",
						},
						{
							globalName: "deserializeError",
							moduleLocalName: "deserializeError",
						},
						{
							globalName: "isErrorLike",
							moduleLocalName: "isErrorLike",
						},
						{
							globalName: "errorConstructors",
							moduleLocalName: "errorConstructors",
						},
					],
				},
			},
		],
	},
};
