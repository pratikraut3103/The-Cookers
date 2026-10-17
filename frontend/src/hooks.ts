// Data hooks for the parent screens: the conversation with the assistant and the week board.
import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "./api";
import type { AskResponse, ChatTurnIn, Lang, WeekResponse } from "./api";
import { errorText } from "./i18n";

export type Turn = {
  id: number;
  question: string;
  status: "loading" | "done" | "error";
  answer?: AskResponse;
  error?: string;
  helpful?: boolean;
};

const HISTORY_TURNS = 3; // earlier question/answer pairs sent along so follow-ups make sense

export function useChat(lang: Lang) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const turnsRef = useRef<Turn[]>([]);
  const nextId = useRef(1);
  useEffect(() => {
    turnsRef.current = turns;
  }, [turns]);

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question) return;
      const id = nextId.current++;
      const history: ChatTurnIn[] = turnsRef.current
        .filter((t) => t.status === "done" && t.answer)
        .slice(-HISTORY_TURNS)
        .flatMap((t) => [
          { role: "user" as const, content: t.question },
          { role: "assistant" as const, content: t.answer!.answer },
        ]);
      setTurns((all) => [...all, { id, question, status: "loading" }]);
      try {
        const answer = await api.ask(question, lang, history);
        setTurns((all) => all.map((t) => (t.id === id ? { ...t, status: "done", answer } : t)));
      } catch (e) {
        setTurns((all) => all.map((t) => (t.id === id ? { ...t, status: "error", error: errorText(e, lang) } : t)));
      }
    },
    [lang],
  );

  const rate = useCallback(async (id: number, helpful: boolean) => {
    const turn = turnsRef.current.find((t) => t.id === id);
    if (!turn?.answer || turn.helpful !== undefined) return;
    setTurns((all) => all.map((t) => (t.id === id ? { ...t, helpful } : t)));
    try {
      await api.feedback(turn.answer.id, helpful);
    } catch {
      /* feedback is best effort: never bother the parent with it */
    }
  }, []);

  const reset = useCallback(() => setTurns([]), []);
  return { turns, send, rate, reset };
}

export type WeekState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: WeekResponse };

export function useWeek(lang: Lang) {
  const [state, setState] = useState<WeekState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    api
      .week(lang)
      .then((data) => !cancelled && setState({ status: "ready", data }))
      .catch((e) => !cancelled && setState({ status: "error", message: errorText(e, lang) }));
    return () => {
      cancelled = true;
    };
  }, [lang, attempt]);
  return { state, retry: () => setAttempt((n) => n + 1) };
}
