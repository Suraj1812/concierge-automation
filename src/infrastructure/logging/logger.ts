import fs from "fs";
import path from "path";
import { createLogger, format, transports, transport } from "winston";
import { env } from "../../config/env";

const logsDirectory = path.resolve(process.cwd(), "logs");
const loggerTransports: transport[] = [
  new transports.Console({
    format: env.NODE_ENV === "development"
      ? format.combine(format.colorize(), format.simple())
      : format.combine(format.timestamp(), format.errors({ stack: true }), format.json())
  })
];

try {
  if (!fs.existsSync(logsDirectory)) {
    fs.mkdirSync(logsDirectory, { recursive: true });
  }

  loggerTransports.push(
    new transports.File({
      filename: path.join(logsDirectory, "combined.log")
    }),
    new transports.File({
      filename: path.join(logsDirectory, "error.log"),
      level: "error"
    })
  );
} catch (error) {
  console.warn("Failed to initialize file log transports", error);
}

export const logger = createLogger({
  level: env.LOG_LEVEL,
  format: format.combine(format.timestamp(), format.errors({ stack: true }), format.json()),
  defaultMeta: {
    service: env.APP_NAME
  },
  transports: loggerTransports
});
