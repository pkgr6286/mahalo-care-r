import {users} from "@workspace/db";
import {and,eq} from "drizzle-orm";
import {getPatientRow,type Store} from "./store";
import {hasPermission,inLocation} from "./access";
import {AppError} from "./errors";
export async function taskAssignment<T extends {assignee?:string;metadata?:Record<string,unknown>}>(s:Store,patientId:string|null|undefined,input:T):Promise<T> {
  const m=input.metadata??{};
  if(m.ownerUserId===undefined) return input;
  if(m.ownerUserId===null) return {...input,assignee:""};
  if(typeof m.ownerUserId!=="string"||!patientId) throw new AppError(400,"Select an active staff member and patient for the task");
  const [user]=await s.select().from(users).where(and(eq(users.id,m.ownerUserId),eq(users.status,"active")));
  const p=await getPatientRow(s,patientId);
  if(!user||!hasPermission(user,"clinical.write")||!inLocation(user,p.location)) throw new AppError(403,"The selected staff member cannot manage this patient's clinical tasks");
  return {...input,assignee:user.name,metadata:{...m,ownerRole:user.role}};
}
