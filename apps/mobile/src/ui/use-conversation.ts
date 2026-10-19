import { useCallback, useEffect, useRef, useState } from "react";
import type { Line } from "../lib/brokely-lines";
import { useTypingDelay } from "./chat";

export type Message =
  | { readonly id: number; readonly from: "brokely"; readonly line: Line }
  | { readonly id: number; readonly from: "me"; readonly text: string; readonly big?: boolean };

/**
 * The chat's history and Brokely's "typing" pauses (D-33). `say` shows Brokely's lines one by
 * one, then moves to the next step; until then the reply area is hidden, so the student
 * never answers a question that isn't on screen yet.
 */
export function useConversation<Step extends string>(firstStep: Step | "waiting") {
  const delay = useTypingDelay();
  const [messages, setMessages] = useState<Message[]>([]);
  const [typing, setTyping] = useState(false);
  const [step, setStep] = useState<Step | "waiting">(firstStep);
  const nextId = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const answer = useCallback((text: string, big?: boolean) => {
    setMessages((m) => [...m, { id: nextId.current++, from: "me", text, big }]);
  }, []);

  const say = useCallback(
    (lines: readonly Line[], then: Step) => {
      setStep("waiting");
      setTyping(true);
      lines.forEach((line, i) => {
        timers.current.push(
          setTimeout(
            () => {
              setMessages((m) => [...m, { id: nextId.current++, from: "brokely", line }]);
              if (i === lines.length - 1) {
                setTyping(false);
                setStep(then);
              }
            },
            delay * (i + 1),
          ),
        );
      });
    },
    [delay],
  );

  return { messages, typing, step, setStep, answer, say };
}
