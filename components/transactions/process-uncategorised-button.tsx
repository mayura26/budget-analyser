"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { recategoriseUncategorised } from "@/lib/actions/transactions";

export function ProcessUncategorisedButton({ count }: { count: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (count === 0) return null;

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      data-testid="process-uncategorised"
      onClick={() => {
        startTransition(async () => {
          await recategoriseUncategorised();
          router.refresh();
        });
      }}
    >
      {pending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
      Process uncategorised ({count})
    </Button>
  );
}
