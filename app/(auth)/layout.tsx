import { LlamaIcon } from "@/components/icons/llama-icon";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <LlamaIcon className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-semibold text-foreground">SpeechEd</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Caseload management for school-based SLPs
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
