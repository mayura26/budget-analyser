/**
 * OpenAI o-series and codex-mini use `reasoning_effort`; they reject `temperature` / `top_p`.
 */
export function isOpenAIReasoningChatModel(model: string): boolean {
  const m = model.toLowerCase();
  if (/^o\d/.test(m)) return true;
  return m === "codex-mini-latest";
}

/**
 * Some models only accept the API default for `temperature` (1); any other value returns 400.
 * Omit `temperature` in the request for these models.
 */
export function openAIModelOnlySupportsDefaultTemperature(
  model: string,
): boolean {
  const m = model.toLowerCase();
  if (/^gpt-5/.test(m)) return true;
  return false;
}
