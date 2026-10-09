"use client";

import { useState, useEffect, useCallback } from "react";
import { Bot, BotOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

interface AiPauseToggleProps {
  conversationId: string;
  /** `conversations.ai_autoreply_disabled` — AI paused on this thread. */
  paused: boolean;
  /** Called after a successful toggle so the parent can patch its local
   *  conversation state (the realtime UPDATE also arrives). */
  onChange?: (paused: boolean) => void;
}

/**
 * Header toggle "IA activa / IA pausada" for one conversation. Unlike
 * `AiThreadBanner` it always renders (the AI may be an external agent
 * that reads `ai_paused` via the public API, not the built-in bot) and
 * only flips the pause flag — the assignee is left untouched.
 */
export function AiPauseToggle({
  conversationId,
  paused,
  onChange,
}: AiPauseToggleProps) {
  const t = useTranslations("Inbox.aiToggle");
  const [busy, setBusy] = useState(false);
  // Optimistic mirror so the button flips instantly; re-seeds when the
  // thread (or its server state via realtime) changes.
  const [value, setValue] = useState(paused);
  useEffect(() => setValue(paused), [conversationId, paused]);

  const toggle = useCallback(async () => {
    const next = !value;
    setBusy(true);
    try {
      const res = await fetch(`/api/ai/autoreply/${conversationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: next, keep_assignment: true }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j?.error ?? t("updateError"));
        return;
      }
      setValue(next);
      onChange?.(next);
      toast.success(next ? t("pausedToast") : t("resumedToast"));
    } catch {
      toast.error(t("networkError"));
    } finally {
      setBusy(false);
    }
  }, [conversationId, value, onChange, t]);

  const Icon = busy ? Loader2 : value ? BotOff : Bot;

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={!value}
      title={value ? t("resumeHint") : t("pauseHint")}
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-medium transition-colors disabled:opacity-60",
        value
          ? "border-amber-500/40 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 dark:text-amber-400"
          : "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20",
      )}
    >
      <Icon className={cn("h-3.5 w-3.5", busy && "animate-spin")} />
      <span className="hidden sm:inline">
        {value ? t("paused") : t("active")}
      </span>
    </button>
  );
}
