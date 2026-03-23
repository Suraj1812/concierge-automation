import express from "express";
import helmet from "helmet";
import cors from "cors";
import path from "path";
import { attachRequestContext } from "./infrastructure/http/request-context";
import { apiRateLimit } from "./middleware/rate-limit";
import { router } from "./routes";
import { errorHandler, notFoundHandler } from "./infrastructure/http/error-handler";

export const app = express();

app.use(helmet());
app.use(cors());
app.use(attachRequestContext);
app.use(
  express.json({
    limit: "1mb",
    verify: (request, _response, buffer) => {
      (request as express.Request).rawBody = Buffer.from(buffer);
    }
  })
);
app.use(
  express.urlencoded({
    extended: true,
    verify: (request, _response, buffer) => {
      (request as express.Request).rawBody = Buffer.from(buffer);
    }
  })
);
app.use(apiRateLimit);
app.use("/storage", express.static(path.resolve(process.cwd(), "storage")));
app.use("/api", router);
app.use(notFoundHandler);
app.use(errorHandler);
