import {existsSync,readFileSync} from "node:fs";
import {resolve} from "node:path";
import svgToPdf from "svg-to-pdfkit";
const candidates=[resolve(process.cwd(),"artifacts/mahalo-care/public/brand"),resolve(process.cwd(),"../mahalo-care/public/brand")];
const root=candidates.find(path=>existsSync(resolve(path,"mahalo-care-color.svg")));
if(!root) throw new Error("Official document branding assets are missing from this installation");
const sans=readFileSync(resolve(root,"fonts/noto-sans-mahalo-pdf-400.ttf"));
const serif=readFileSync(resolve(root,"fonts/victor-serif-smooth-600.otf"));
const logo=readFileSync(resolve(root,"mahalo-care-color.svg"),"utf8");
export function applyDocumentBrand(pdf:PDFKit.PDFDocument) {
  pdf.registerFont("MahaloSans",sans).registerFont("MahaloSerif",serif);
  svgToPdf(pdf,logo,54,45,{width:150,height:29,preserveAspectRatio:"xMinYMin meet"});
}
