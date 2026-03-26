"use client";

import { useActionState } from "react";
import { saveSettings } from "@/lib/actions/settings";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle } from "lucide-react";

const MODELS = [
  { value: "gpt-4o-mini", label: "GPT-4o Mini (recommended)" },
  { value: "gpt-4o", label: "GPT-4o" },
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
          Configure your OpenAI API key via the <code>OPENAI_API_KEY</code> environment variable to enable automatic transaction categorisation.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label>Model</Label>
            <Select name="openai_model" defaultValue={defaultValues.openai_model}>
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

          <div className="flex items-center gap-3">
            <Label htmlFor="ai_enabled">Enable AI categorisation</Label>
            <select
              id="ai_enabled"
              name="ai_enabled"
              defaultValue={defaultValues.ai_enabled}
              className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
            >
              <option value="false">Disabled</option>
              <option value="true">Enabled</option>
            </select>
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
