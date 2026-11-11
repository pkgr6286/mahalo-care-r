import {users} from "@workspace/db";
import {and,eq} from "drizzle-orm";
import {getPatientRow,type Store} from "./store";
import {hasPermission,inLocation} from "./access";
import {AppError} from "./errors";
import {staffRoleAt} from "./staff-identity";
export async function taskAssignment<T extends {assignee?:string;metadata?:Record<string,unknown>}>(s:Store,patientId:string|null|undefined,input:T):Promise<T> {
  const m=input.metadata??{};
  if(m.ownerUserId===undefined) return input;
  if(m.ownerUserId===null) return {...input,assignee:""};
  if(typeof m.ownerUserId!=="string"||!patientId) throw new AppError(400,"Select an active staff member and patient for the task");
  const [user]=await s.select().from(users).where(and(eq(users.id,m.ownerUserId),eq(users.status,"active")));
  const p=await getPatientRow(s,patientId);
  const role=user&&staffRoleAt(user,p.location);
  if(!user||!role||!hasPermission({...user,role},"clinical.write")) throw new AppError(403,"The selected staff member cannot manage this patient's clinical tasks");
  return {...input,assignee:user.name,metadata:{...m,ownerRole:role}};
}
