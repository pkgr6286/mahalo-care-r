import {AppError} from "./errors";
const hidden=new Set(["id","key","synthetic","scenarioKey","dataset","source","sourceSystem","sourceRef","sourceIds","policySnapshot","instrumentSnapshot","contextSnapshot","sourceSnapshot","templateSections","sectionValues","templateVersion","templateName","nonValidatedDemo","contentApprovedForUse","contentReview","contentReviewHash","contentReviewFingerprint","contentLicense","sourceLicense","sourceUrl","sourceTimeIds","sourceObservationIds","sourceSupplyIds","sourceInteractionIds","sourceResponseIds","sourceEnrollmentIds","sourcePlanIds","sourceConsentIds","sourceDeviceIds","signatureImage","signatureData","base64"]);
const label=(key:string)=>{const text=key.replace(/([a-z0-9])([A-Z])/g,"$1 $2").replaceAll("_"," ");return text.charAt(0).toUpperCase()+text.slice(1);};
export function renderClinicalDocumentContent(pdf:PDFKit.PDFDocument,metadata:Record<string,unknown>,timeZone:string){
  let fields=0,characters=0;
  const heading=(text:string,level=0)=>pdf.moveDown(level?.55:.9).font(level?"MahaloSans":"MahaloSerif").fontSize(level?10:12).fillColor("#181A1C").text(text);
  const text=(value:string)=>{characters+=value.length;if(characters>100000)throw new AppError(413,"This clinical document exceeds the readable-content limit; no partial signed PDF was retained.");pdf.font("MahaloSans").fontSize(10).fillColor("#323237").text(value,{lineGap:3});};
  const printable=(key:string)=>!hidden.has(key)&&!["ids","fingerprint","password","passwordHash","token","secret"].includes(key)&&!/(?:[a-z0-9]Ids?|[a-z0-9]IDs?|_ids?|Hash|Fingerprint|ObjectPath|Generation)$/.test(key);
  const scalar=(value:unknown)=>{
    if(typeof value==="boolean")return value?"Yes":"No";
    if(typeof value==="string"&&/^\d{4}-\d{2}-\d{2}T\d{2}:/.test(value)&&Number.isFinite(Date.parse(value)))return new Intl.DateTimeFormat("en-US",{timeZone,dateStyle:"medium",timeStyle:"short"}).format(new Date(value));
    if(typeof value==="string"&&/^[a-z]+(?:_[a-z0-9]+)+$/.test(value))return label(value);
    return String(value);
  };
  function render(key:string,value:unknown,depth=0){
    if(!printable(key)||value===undefined||value===null||value==="")return;
    if(++fields>2000||depth>10)throw new AppError(413,"This clinical document is too complex to render completely; no partial signed PDF was retained.");
    heading(label(key),depth);
    if(Array.isArray(value)){
      for(const item of value){
        if(item&&typeof item==="object"){
          const object=item as Record<string,unknown>,display=typeof object.label==="string"?object.label:typeof object.title==="string"?object.title:null;
          if(display)heading(display,depth+1);
          for(const [k,v]of Object.entries(object))if(!display||k!=="label"&&k!=="title")render(k,v,depth+1);
        }
        else if(item!==null&&item!==undefined)text(`• ${scalar(item)}`);
      }
    }else if(typeof value==="object"){
      for(const [k,v]of Object.entries(value))render(k,v,depth+1);
    }else text(scalar(value));
  }
  if(metadata.nonValidatedDemo===true){heading("Practice material");text("Synthetic practice content — not a clinically validated instrument or live-care protocol.");}
  const sections=Array.isArray(metadata.templateSections)?metadata.templateSections:[],values=metadata.sectionValues;
  if(values&&typeof values==="object"&&!Array.isArray(values)){
    for(const section of sections){
      if(!section||typeof section!=="object")continue;
      const s=section as Record<string,unknown>,key=String(s.key??""),v=(values as Record<string,unknown>)[key];
      if(v!==undefined&&v!==null&&v!==""){
        if(typeof v==="object")render(String(s.label??label(key)),v);
        else{heading(String(s.label??label(key)));text(scalar(v));}
      }
    }
    for(const [key,value]of Object.entries(values))if(!sections.some(s=>s&&typeof s==="object"&&(s as Record<string,unknown>).key===key))render(key,value);
  }
  for(const [key,value]of Object.entries(metadata))render(key,value);
}
