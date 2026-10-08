import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default function Page() {
  redirect(process.env.PUBLIC_SITE_URL ?? "http://localhost:4321");
}
