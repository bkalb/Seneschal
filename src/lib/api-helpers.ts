import { auth } from "./auth";
import { headers } from "next/headers";

export async function requireSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return { session: null, userId: null };
  }
  return { session, userId: session.user.id };
}
