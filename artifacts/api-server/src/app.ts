import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { AppError } from "./lib/errors";
import { ZodError } from "zod";
import {serveBuiltWeb} from "./lib/web-serving";

const app: Express = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.disable("etag");
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
app.use(express.json({ limit: "1mb", verify(req,_res,body) {
  if(req.url?.startsWith("/api/webhooks/devices/")) (req as typeof req & {rawBody?:Buffer}).rawBody=Buffer.from(body);
} }));
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

app.use("/api",(_req,res,next)=>{res.setHeader("Cache-Control","private, no-store");res.vary("Cookie");next();},router,(_req,res)=>{res.status(404).json({error:"API route not found"});});
if(process.env.SERVE_WEB==="true")serveBuiltWeb(app);
app.use((error:unknown,req:express.Request,res:express.Response,_next:express.NextFunction)=>{
  let cause=error;
  for(let i=0;i<4&&cause&&typeof cause==="object";i++) {
    const dbError=cause as {code?:string;constraint?:string;cause?:unknown};
    if(dbError.code==="23P01") {res.status(409).json({error:"Time overlaps an existing entry or another timer is already running"});return;}
    if(dbError.code==="23514"&&dbError.constraint==="care_time_valid") {res.status(400).json({error:"Time must have a patient, user and valid exact interval"});return;}
    if(dbError.code==="23514"&&dbError.constraint==="care_policy_immutable") {res.status(409).json({error:"Reviewed policies are immutable and must follow draft, review, publish and retire transitions"});return;}
    if(dbError.code==="23514"&&["care_documents_immutable","care_clinical_signature_immutable"].includes(dbError.constraint??"")) {res.status(409).json({error:"Signed clinical history and retained documents are immutable; create a new revision instead"});return;}
    cause=dbError.cause;
  }
  if(error instanceof SyntaxError&&"body" in error) {res.status(400).json({error:"Invalid JSON body"});return;}
  if(error&&typeof error==="object"&&"type" in error&&error.type==="entity.too.large") {res.status(413).json({error:"The request body exceeds the one-megabyte limit"});return;}
  if(error instanceof ZodError) {res.status(400).json({error:"Invalid input",details:error.issues.map(i=>({path:i.path,message:i.message}))});return;}
  if(error instanceof AppError) {res.status(error.status).json({error:error.message});return;}
  req.log.error({errorType:error instanceof Error?error.name:"unknown"},"Request failed");
  res.status(500).json({error:"The request could not be completed"});
});

export default app;
