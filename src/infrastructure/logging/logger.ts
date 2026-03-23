import fs from "fs";
import path from "path";
import { createLogger, format, transports } from "winston";
import { env } from "../../config/env";

const logsDirectory = path.resolve(process.cwd(), "logs");

if (!fs.existsSync(logsDirectory)) {
  fs.mkdirSync(logsDirectory, { recursive: true });
}

export const logger = createLogger({
  level: env.LOG_LEVEL,
  format: format.combine(format.timestamp(), format.errors({ stack: true }), format.json()),
  defaultMeta: {
    service: env.APP_NAME
  },
  transports: [
    new transports.Console({
      format: env.NODE_ENV === "development"
        ? format.combine(format.colorize(), format.simple())
        : format.combine(format.timestamp(), format.errors({ stack: true }), format.json())
    }),
    new transports.File({
      filename: path.join(logsDirectory, "combined.log")
    }),
    new transports.File({
      filename: path.join(logsDirectory, "error.log"),
      level: "error"
    })
  ]
});
