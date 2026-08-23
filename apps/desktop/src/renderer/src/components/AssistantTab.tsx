import React, {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  MessageSquare,
  RefreshCw,
  Send,
  Settings,
  Sparkles,
  User,
} from "lucide-react";
import {
  AssistantStreamEvent,
  RecommendationGenerationState,
  RecommendationRecord,
  RecommendationsGetActiveResponse,
} from "@horizon/shared-types";
import { Button } from "@horizon/ui";
import { RecommendationCard } from "./RecommendationCard";

function stateSubtitle(state: RecommendationGenerationState): string {
  if (state === "waiting_for_scan") return "Run a scan before asking for recommendations";
  if (state === "generating" || state === "preparing_context" || state === "validating") {
    return "Review cards are being prepared from the latest scan metadata";
  }
  if (state === "provider_unavailable") return "Connect an AI provider in Settings to generate cards";
  if (state === "no_results") return "No useful recommendations were found for the latest scan";
  if (state === "error") return "The last generation attempt did not complete";
  if (state === "ready") return "Metadata based cleanup suggestions from the latest completed scan";
  return "Generate review cards after the next completed scan";
}

function stateIcon(state: RecommendationGenerationState) {
  if (state === "ready") return <CheckCircle2 className="h-4 w-4" aria-hidden="true" />;
  if (state === "provider_unavailable" || state === "error") {
    return <AlertCircle className="h-4 w-4" aria-hidden="true" />;
  }
  return <Sparkles className="h-4 w-4" aria-hidden="true" />;
}

interface AssistantTabProps {
  onReviewRecommendation: (recommendation: RecommendationRecord) => void;
  onOpenSettings: () => void;
}

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  state: "streaming" | "done" | "error";
};

function appendAssistantChunk(
  messages: ChatMessage[],
  requestId: string,
  chunk: string
): ChatMessage[] {
  const existingIndex = messages.findIndex((message) => message.id === requestId);
  if (existingIndex === -1) {
    return [
      ...messages,
      { id: requestId, role: "assistant", content: chunk, state: "streaming" },
    ];
  }

  return messages.map((message, index) =>
    index === existingIndex
      ? { ...message, content: `${message.content}${chunk}`, state: "streaming" }
      : message
  );
}

export const AssistantTab = React.memo(function AssistantTab({
  onReviewRecommendation,
  onOpenSettings,
}: AssistantTabProps) {
  const [data, setData] = useState<RecommendationsGetActiveResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [dismissingId, setDismissingId] = useState<number | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  const generationState = data?.generationState ?? "idle";
  const recommendations = data?.recommendations ?? [];
  const isWorking =
    isLoading ||
    isRegenerating ||
    generationState === "generating" ||
    generationState === "preparing_context" ||
    generationState === "validating";

  const loadRecommendations = useCallback(async () => {
    if (!window.horizon?.recommendations) return;
    setIsLoading(true);
    try {
      const res = await window.horizon.recommendations.getActive();
      if (res.ok && res.data) setData(res.data);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecommendations();

    const unsubscribeGeneration =
      window.horizon?.recommendations?.onGenerationEvent(() => {
        loadRecommendations();
      });
    const unsubscribeScan = window.horizon?.scan?.onProgress((event) => {
      if (event.event === "complete") loadRecommendations();
    });

    return () => {
      unsubscribeGeneration?.();
      unsubscribeScan?.();
    };
  }, [loadRecommendations]);

  useEffect(() => {
    const unsubscribeAssistant = window.horizon?.assistant?.onStream(
      (event: AssistantStreamEvent) => {
        if (event.event === "started") {
          setActiveRequestId(event.requestId);
          setChatError(null);
          return;
        }

        if (event.event === "chunk" && event.chunk) {
          setChatMessages((messages) =>
            appendAssistantChunk(messages, event.requestId, event.chunk ?? "")
          );
          return;
        }

        if (event.event === "completed") {
          setActiveRequestId(null);
          setChatMessages((messages) =>
            messages.map((message) =>
              message.id === event.requestId ? { ...message, state: "done" } : message
            )
          );
          return;
        }

        if (event.event === "failed") {
          const message = event.message || "The assistant request failed.";
          setActiveRequestId(null);
          setChatError(message);
          setChatMessages((messages) => {
            const hasPlaceholder = messages.some((item) => item.id === event.requestId);
            if (!hasPlaceholder) {
              return [
                ...messages,
                {
                  id: event.requestId,
                  role: "assistant",
                  content: message,
                  state: "error",
                },
              ];
            }
            return messages.map((item) =>
              item.id === event.requestId
                ? { ...item, content: message, state: "error" }
                : item
            );
          });
        }
      }
    );

    return () => {
      unsubscribeAssistant?.();
    };
  }, []);

  useEffect(() => {
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [chatMessages]);

  const handleRegenerate = async () => {
    if (!window.horizon?.recommendations) return;
    setIsRegenerating(true);
    try {
      const res = await window.horizon.recommendations.regenerate();
      if (res.ok) await loadRecommendations();
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleDismiss = async (recommendationId: number) => {
    if (!window.horizon?.recommendations) return;
    setDismissingId(recommendationId);
    try {
      const res = await window.horizon.recommendations.dismiss(recommendationId);
      if (res.ok) await loadRecommendations();
    } finally {
      setDismissingId(null);
    }
  };

  const handleChatSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!window.horizon?.assistant || activeRequestId) return;

    const message = chatInput.trim();
    if (!message) return;

    setChatInput("");
    setChatError(null);

    const res = await window.horizon.assistant.chat(message);
    if (res.ok && res.data) {
      setActiveRequestId(res.data.requestId);
      setChatMessages((messages) => [
        ...messages,
        {
          id: `user-${res.data!.requestId}`,
          role: "user",
          content: message,
          state: "done",
        },
        {
          id: res.data!.requestId,
          role: "assistant",
          content: "",
          state: "streaming",
        },
      ]);
      return;
    }

    setChatError(res.error?.message || "Failed to start assistant chat.");
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-border bg-background px-6">
        <div>
          <h1 className="font-rounded text-title text-text-primary">Assistant</h1>
          <p className="text-meta text-text-secondary">{stateSubtitle(generationState)}</p>
        </div>
        <div className="flex items-center gap-2">
          {generationState === "provider_unavailable" ? (
            <Button
              type="button"
              onClick={onOpenSettings}
              className="inline-flex items-center gap-2"
            >
              <Settings className="h-4 w-4" aria-hidden="true" />
              Settings
            </Button>
          ) : null}
          <Button
            type="button"
            onClick={handleRegenerate}
            disabled={isWorking || generationState === "waiting_for_scan"}
            className="inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <RefreshCw
              className={`h-4 w-4 ${isWorking ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            Regenerate
          </Button>
        </div>
      </header>

      <main className="flex flex-1 flex-col overflow-y-auto p-6">
        {recommendations.length > 0 ? (
          <div className="mb-4 rounded-md border border-border bg-surface p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-surface-secondary text-text-secondary">
                {stateIcon(generationState)}
              </div>
              <div className="min-w-0">
                <p className="text-row font-semibold text-text-primary">
                  Review only recommendations
                </p>
                <p className="mt-1 text-meta text-text-secondary">
                  Cards are generated from metadata such as paths, sizes, dates,
                  categories, duplicate groups, and forecast signals.
                </p>
                {data?.lastError ? (
                  <p className="mt-2 text-meta-emphasis text-tag-danger-text">
                    {data.lastError.message}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {isWorking && recommendations.length === 0 ? (
          <section className="mb-4">
            <div className="flex min-h-[140px] items-center justify-center rounded-md border border-border bg-surface p-8 text-center">
              <div>
                <RefreshCw className="mx-auto h-5 w-5 animate-spin text-text-secondary" aria-hidden="true" />
                <p className="mt-3 text-row font-semibold text-text-primary">
                  Loading recommendations…
                </p>
              </div>
            </div>
          </section>
        ) : recommendations.length > 0 ? (
          <section className="mb-4">
            <div className="grid gap-4">
              {recommendations.map((recommendation) => (
                <RecommendationCard
                  key={recommendation.id}
                  recommendation={recommendation}
                  onReview={onReviewRecommendation}
                  onDismiss={handleDismiss}
                  isDismissing={dismissingId === recommendation.id}
                />
              ))}
            </div>
          </section>
        ) : null}

        <section className="flex flex-1 flex-col rounded-md border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <MessageSquare className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
              <h2 className="truncate text-row font-semibold text-text-primary">
                Ask Horizon
              </h2>
            </div>
            {activeRequestId ? (
              <span className="inline-flex items-center gap-2 text-meta text-text-secondary">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                Thinking
              </span>
            ) : null}
          </div>

          <div
            ref={transcriptRef}
            className="max-h-[260px] min-h-[180px] overflow-y-auto px-4 py-3"
          >
            {chatMessages.length === 0 ? (
              <div className="flex h-[150px] items-center justify-center text-center">
                <div>
                  <Bot className="mx-auto h-6 w-6 text-text-secondary" aria-hidden="true" />
                  <p className="mt-3 text-row font-semibold text-text-primary">
                    Ask about the latest scan
                  </p>
                  <p className="mt-1 max-w-md text-meta text-text-secondary">
                    Try duplicates in Downloads, large videos, unused archives,
                    or forecast risk.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid gap-3">
                {chatMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex gap-3 ${
                      message.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    {message.role === "assistant" ? (
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-surface-secondary text-text-secondary">
                        <Bot className="h-4 w-4" aria-hidden="true" />
                      </div>
                    ) : null}
                    <div
                      className={`max-w-[75%] rounded-md border border-border px-3 py-2 ${
                        message.role === "user"
                          ? "bg-accent-primary text-text-inverse"
                          : "bg-background text-text-primary"
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words text-meta">
                        {message.content ||
                          (message.state === "streaming" ? "Thinking..." : "")}
                      </p>
                    </div>
                    {message.role === "user" ? (
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-surface-secondary text-text-secondary">
                        <User className="h-4 w-4" aria-hidden="true" />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          <form onSubmit={handleChatSubmit} className="border-t border-border p-3">
            {chatError ? (
              <p className="mb-2 text-meta-emphasis text-tag-danger-text">
                {chatError}
              </p>
            ) : null}
            <div className="flex items-end gap-2">
              <label htmlFor="assistant-chat-input" className="sr-only">
                Ask Horizon
              </label>
              <textarea
                id="assistant-chat-input"
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder="Ask about duplicate groups, large files, unused files, or forecast risk"
                rows={2}
                disabled={!!activeRequestId}
                className="min-h-[48px] flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-row text-text-primary placeholder:text-text-tertiary focus:border-accent-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-70"
              />
              <Button
                type="submit"
                disabled={!chatInput.trim() || !!activeRequestId}
                className="inline-flex h-12 items-center gap-2 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
                Send
              </Button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
});
