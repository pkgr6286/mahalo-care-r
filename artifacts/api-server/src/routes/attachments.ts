import {Router} from "express";
import {z} from "zod";
import {RequestPatientAttachmentUploadBody,ReviewPatientAttachmentBody,ListPatientAttachmentsResponse,RequestPatientAttachmentUploadResponse,CompletePatientAttachmentResponse,ReviewPatientAttachmentResponse} from "@workspace/api-zod";
import type {Actor} from "../lib/store";
import {listAttachments,requestAttachment,completeAttachment,reviewAttachment,downloadAttachment} from "../lib/attachment-workflows";
const params=z.object({id:z.string().uuid(),attachmentId:z.string().uuid().optional()});
export const attachmentsRouter=Router();
const base="/patients/:id/attachments";
attachmentsRouter.get(base,async(req,res):Promise<void>=>{
  const {id}=params.parse(req.params);res.json(ListPatientAttachmentsResponse.parse(await listAttachments(res.locals.actor as Actor,id)));
});
attachmentsRouter.post(`${base}/uploads`,async(req,res):Promise<void>=>{
  const {id}=params.parse(req.params),body=RequestPatientAttachmentUploadBody.strict().parse(req.body);
  res.json(RequestPatientAttachmentUploadResponse.parse(await requestAttachment(res.locals.actor as Actor,id,body)));
});
attachmentsRouter.post(`${base}/:attachmentId/complete`,async(req,res):Promise<void>=>{
  const {id,attachmentId}=params.required().parse(req.params);
  res.json(CompletePatientAttachmentResponse.parse(await completeAttachment(res.locals.actor as Actor,id,attachmentId)));
});
attachmentsRouter.post(`${base}/:attachmentId/review`,async(req,res):Promise<void>=>{
  const {id,attachmentId}=params.required().parse(req.params),body=ReviewPatientAttachmentBody.strict().parse(req.body);
  res.json(ReviewPatientAttachmentResponse.parse(await reviewAttachment(res.locals.actor as Actor,id,attachmentId,{...body,expectedUpdatedAt:body.expectedUpdatedAt.toISOString()})));
});
attachmentsRouter.get(`${base}/:attachmentId/download`,async(req,res):Promise<void>=>{
  const {id,attachmentId}=params.required().parse(req.params),result=await downloadAttachment(res.locals.actor as Actor,id,attachmentId);
  res.set({"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}).attachment(result.row.filename).type("application/pdf").send(result.bytes);
});
