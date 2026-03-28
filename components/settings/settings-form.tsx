"use client";

import { CheckCircle } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveSettings } from "@/lib/actions/settings";

const MODELS = [
  { value: "gpt-4o-mini", label: "GPT-4o Mini (recommended)" },
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "gpt-4.1", label: "GPT-4.1" },
  { value: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
  { value: "gpt-4.1-nano", label: "GPT-4.1 Nano" },
  { value: "gpt-5-mini", label: "GPT-5 Mini" },
  { value: "gpt-5-nano", label: "GPT-5 Nano" },
  { value: "gpt-5", label: "GPT-5" },
  { value: "gpt-5.1", label: "GPT-5.1" },
  { value: "gpt-5.4", label: "GPT-5.4" },
  { value: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
  { value: "gpt-5.4-nano", label: "GPT-5.4 Nano" },
  { value: "o4-mini", label: "o4-mini (reasoning)" },
  { value: "o3-mini", label: "o3-mini (reasoning)" },
  { value: "o3", label: "o3 (reasoning)" },
  { value: "o1-mini", label: "o1-mini (reasoning)" },
  { value: "o1", label: "o1 (reasoning)" },
  { value: "codex-mini-latest", label: "codex-mini-latest (reasoning)" },
  { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
];

export function SettingsForm({
  defaultValues,
}: {
  defaultValues: {
    openai_model: string;
    ai_enabled: string;
  };
}) {
  const [state, formAction, pending] = useActionState(saveSettings, null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Categorisation</CardTitle>
        <CardDescription>
          Configure your OpenAI API key via the <code>OPENAI_API_KEY</code>{" "}
          environment variable to enable automatic transaction categorisation.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label>Model</Label>
            <Select
              name="openai_model"
              defaultValue={defaultValues.openai_model}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODELS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <Label htmlFor="ai_enabled">Enable AI categorisation</Label>
            <Select name="ai_enabled" defaultValue={defaultValues.ai_enabled}>
              <SelectTrigger id="ai_enabled" className="w-full sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="false">Disabled</SelectItem>
                <SelectItem value="true">Enabled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {state?.success && (
            <div className="flex items-center gap-2 text-green-600 text-sm">
              <CheckCircle className="h-4 w-4" />
              Settings saved
            </div>
          )}
          {state && !state.success && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}

          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save settings"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
