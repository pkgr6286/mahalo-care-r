import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { AppError } from "./lib/errors";
import { ZodError } from "zod";

const app: Express = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use((req,res,next)=>{
  if(!["GET","HEAD","OPTIONS"].includes(req.method)) {
    const origin=req.get("origin");
    if(origin) {
      try {
        const expected=req.get("x-forwarded-host")||req.get("host");
        if(new URL(origin).host!==expected) {res.status(403).json({error:"Cross-origin state changes are not allowed"});return;}
      } catch {res.status(403).json({error:"Invalid request origin"});return;}
    }
  }
  next();
});

app.use("/api", router);
app.use((error:unknown,req:express.Request,res:express.Response,_next:express.NextFunction)=>{
  if(error instanceof ZodError) {res.status(400).json({error:"Invalid input",details:error.issues.map(i=>({path:i.path,message:i.message}))});return;}
  if(error instanceof AppError) {res.status(error.status).json({error:error.message});return;}
  req.log.error({errorType:error instanceof Error?error.name:"unknown"},"Request failed");
  res.status(500).json({error:"The request could not be completed"});
});

export default app;
