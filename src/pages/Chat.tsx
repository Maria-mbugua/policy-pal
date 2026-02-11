import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Send, Bot, User, FileText } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useToast } from "@/hooks/use-toast";

type Citation = {
  document_title: string;
  page_number: number;
  section_title?: string;
  content: string;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[] | null;
};

export default function Chat() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentConvId, setCurrentConvId] = useState<string | null>(conversationId || null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [expandedCitation, setExpandedCitation] = useState<string | null>(null);

  useEffect(() => {
    if (conversationId) {
      setCurrentConvId(conversationId);
      loadMessages(conversationId);
    } else {
      setMessages([]);
      setCurrentConvId(null);
    }
  }, [conversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadMessages = async (convId: string) => {
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", convId)
      .order("created_at");
    if (data) {
      setMessages(
        data.map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          citations: m.citations as Citation[] | null,
        }))
      );
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || !user || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setIsLoading(true);

    let convId = currentConvId;

    // Create conversation if needed
    if (!convId) {
      const { data: conv, error } = await supabase
        .from("conversations")
        .insert({ user_id: user.id, title: userMessage.slice(0, 80) })
        .select()
        .single();
      if (error || !conv) {
        toast({ title: "Error", description: "Failed to create conversation", variant: "destructive" });
        setIsLoading(false);
        return;
      }
      convId = conv.id;
      setCurrentConvId(convId);
      navigate(`/chat/${convId}`, { replace: true });
    }

    // Save user message
    const { data: savedMsg } = await supabase
      .from("messages")
      .insert({ conversation_id: convId, role: "user", content: userMessage })
      .select()
      .single();

    if (savedMsg) {
      setMessages((prev) => [...prev, { id: savedMsg.id, role: "user", content: userMessage, citations: null }]);
    }

    // Stream AI response
    let assistantContent = "";
    const tempId = crypto.randomUUID();
    setMessages((prev) => [...prev, { id: tempId, role: "assistant", content: "", citations: null }]);

    try {
      const messagesForAI = messages.map((m) => ({ role: m.role, content: m.content }));
      messagesForAI.push({ role: "user", content: userMessage });

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: messagesForAI, conversationId: convId }),
      });

      if (!resp.ok) {
        const errorData = await resp.json().catch(() => ({}));
        throw new Error(errorData.error || `Request failed with status ${resp.status}`);
      }

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let citations: Citation[] | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;

          try {
            const parsed = JSON.parse(jsonStr);
            // Check for citations in custom field
            if (parsed.citations) {
              citations = parsed.citations;
            }
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantContent += content;
              setMessages((prev) =>
                prev.map((m) => (m.id === tempId ? { ...m, content: assistantContent } : m))
              );
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      // Save assistant message
      const { data: assistantMsg } = await supabase
        .from("messages")
        .insert({
          conversation_id: convId,
          role: "assistant",
          content: assistantContent,
          citations: citations as any,
        })
        .select()
        .single();

      if (assistantMsg) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempId
              ? { ...m, id: assistantMsg.id, content: assistantContent, citations }
              : m
          )
        );
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Bot className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-2xl font-bold">Ask about your policies</h2>
              <p className="text-muted-foreground max-w-md">
                Ask any question about uploaded policy documents. I'll provide answers with exact citations so you can verify everything.
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
              {msg.role === "assistant" && (
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
              )}
              <div className={`max-w-[80%] ${msg.role === "user" ? "bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-3" : "space-y-3"}`}>
                {msg.role === "user" ? (
                  <p className="text-sm">{msg.content}</p>
                ) : (
                  <>
                    <div className="prose prose-sm max-w-none dark:prose-invert">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="space-y-2 mt-3">
                        <p className="text-xs font-medium text-muted-foreground">Sources:</p>
                        {msg.citations.map((citation, i) => (
                          <button
                            key={i}
                            className="block w-full text-left"
                            onClick={() => setExpandedCitation(expandedCitation === `${msg.id}-${i}` ? null : `${msg.id}-${i}`)}
                          >
                            <Card className="p-3 hover:bg-muted/50 transition-colors cursor-pointer">
                              <div className="flex items-center gap-2 text-xs">
                                <FileText className="h-3.5 w-3.5 text-primary" />
                                <span className="font-medium">{citation.document_title}</span>
                                <span className="text-muted-foreground">• Page {citation.page_number}</span>
                                {citation.section_title && (
                                  <span className="text-muted-foreground">• {citation.section_title}</span>
                                )}
                              </div>
                              {expandedCitation === `${msg.id}-${i}` && (
                                <p className="mt-2 text-xs text-muted-foreground border-t pt-2">{citation.content}</p>
                              )}
                            </Card>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
              {msg.role === "user" && (
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-1">
                  <User className="h-4 w-4" />
                </div>
              )}
            </div>
          ))}
          {isLoading && messages[messages.length - 1]?.role === "user" && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Bot className="h-4 w-4 text-primary animate-pulse" />
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:-0.3s]" />
                <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:-0.15s]" />
                <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="border-t bg-background/80 backdrop-blur-sm px-4 py-4">
        <div className="max-w-3xl mx-auto flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your policy documents..."
            className="resize-none min-h-[44px] max-h-32"
            rows={1}
          />
          <Button onClick={sendMessage} disabled={!input.trim() || isLoading} size="icon" className="shrink-0">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
