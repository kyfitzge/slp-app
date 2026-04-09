import { redirect } from "next/navigation";

// Root → redirect to /dashboard (middleware handles auth check)
export default function Home() {
  redirect("/dashboard");
}
