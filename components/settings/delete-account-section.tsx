"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Trash2, TriangleAlert } from "lucide-react";

const CONFIRM_PHRASE = "DELETE";

export function DeleteAccountSection() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);

  const isConfirmed = confirmText === CONFIRM_PHRASE;

  async function handleDelete() {
    if (!isConfirmed) return;
    setLoading(true);

    try {
      const res = await fetch("/api/users/me", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to delete account");
      }

      // Sign out client-side so the session cookie is cleared
      const supabase = createClient();
      await supabase.auth.signOut();

      toast.success("Your account has been deleted.");
      router.push("/login");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 space-y-3">
      <div className="flex items-start gap-3">
        <TriangleAlert className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div>
          <h3 className="text-sm font-semibold text-destructive">Danger Zone</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Permanently delete your account and all associated data — students,
            IEPs, goals, sessions, notes, and reports. This cannot be undone.
          </p>
        </div>
      </div>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setConfirmText("");
        }}
      >
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground gap-1.5"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete Account
          </Button>
        </DialogTrigger>

        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <TriangleAlert className="h-5 w-5" />
              Delete your account
            </DialogTitle>
            <DialogDescription className="text-left space-y-2 pt-1">
              <span className="block">
                This will permanently delete your account and{" "}
                <strong>all of your data</strong>, including:
              </span>
              <ul className="list-disc list-inside text-xs space-y-0.5 text-muted-foreground">
                <li>All student records, IEPs, and goals</li>
                <li>All session notes and goal data</li>
                <li>All progress reports and evaluation reports</li>
                <li>Your schedule and all settings</li>
              </ul>
              <span className="block font-medium text-foreground">
                This action cannot be undone.
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-1">
            <label className="text-sm text-muted-foreground">
              Type{" "}
              <span className="font-mono font-semibold text-foreground">
                {CONFIRM_PHRASE}
              </span>{" "}
              to confirm:
            </label>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={CONFIRM_PHRASE}
              className="font-mono"
              autoComplete="off"
              autoFocus
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={!isConfirmed || loading}
              className="gap-1.5"
            >
              {loading ? "Deleting…" : "Delete my account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
