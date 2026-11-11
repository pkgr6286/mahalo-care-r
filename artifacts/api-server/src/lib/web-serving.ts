import express,{type Express} from "express";
import {existsSync} from "node:fs";
import {extname,resolve} from "node:path";
/** Optional one-port deployment. Development keeps the existing separately managed Vite service. */
export function serveBuiltWeb(app:Express) {
  const root=resolve(process.cwd(),"artifacts/mahalo-care/dist/public"),index=resolve(root,"index.html");
  if(!existsSync(index))throw new Error("Built Mahalo web assets are missing; run build:portable from the workspace root");
  app.use(express.static(root,{index:false,dotfiles:"deny",setHeaders:(res,path)=>{
    res.setHeader("Cache-Control",path.includes("/assets/")?"public, max-age=31536000, immutable":"no-store");
  }}));
  app.get("/{*path}",(req,res,next)=>{
    if(req.path==="/api"||req.path.startsWith("/api/")){next();return;}
    if(extname(req.path)||!req.accepts("html")){res.status(404).end();return;}
    res.setHeader("Cache-Control","no-store");res.sendFile(index);
  });
}
