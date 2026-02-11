import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, conversationId } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get the latest user message for context search
    const userMessage = messages[messages.length - 1]?.content || "";

    // Search for relevant document chunks using text matching (simple keyword search)
    // In production, you'd use embeddings for semantic search
    const { data: chunks } = await supabase
      .from("document_chunks")
      .select("content, page_number, section_title, document_id")
      .textSearch("content", userMessage.split(" ").slice(0, 5).join(" & "), { type: "plain" })
      .limit(5);

    // Get document titles for citations
    let contextText = "";
    const citations: { document_title: string; page_number: number; section_title: string; content: string }[] = [];

    if (chunks && chunks.length > 0) {
      const docIds = [...new Set(chunks.map((c) => c.document_id))];
      const { data: docs } = await supabase
        .from("documents")
        .select("id, title")
        .in("id", docIds);

      const docMap = new Map(docs?.map((d) => [d.id, d.title]) || []);

      for (const chunk of chunks) {
        const docTitle = docMap.get(chunk.document_id) || "Unknown Document";
        contextText += `\n---\nSource: ${docTitle}, Page ${chunk.page_number || "N/A"}, Section: ${chunk.section_title || "N/A"}\n${chunk.content}\n`;
        citations.push({
          document_title: docTitle,
          page_number: chunk.page_number || 0,
          section_title: chunk.section_title || "",
          content: chunk.content.slice(0, 300),
        });
      }
    }

    const systemPrompt = `You are Policy Oracle, an AI assistant that answers questions ONLY based on provided policy documents. 

RULES:
1. Answer ONLY from the provided document context below. If the context doesn't contain relevant information, say "I couldn't find information about that in the uploaded documents."
2. Always cite your sources with document name and page number.
3. Be precise and professional. This is used for compliance and governance.
4. Format your answers clearly with markdown when helpful.

DOCUMENT CONTEXT:
${contextText || "No documents have been uploaded or indexed yet. Please let the user know they need to upload documents first."}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI usage limit reached. Please add credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create a transform stream to inject citations at the end
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const reader = response.body!.getReader();

    (async () => {
      try {
        // First, send citation data as a custom SSE event
        if (citations.length > 0) {
          const citationEvent = `data: ${JSON.stringify({ citations })}\n\n`;
          await writer.write(new TextEncoder().encode(citationEvent));
        }

        // Then pipe through the AI response
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          await writer.write(value);
        }
      } finally {
        await writer.close();
      }
    })();

    return new Response(readable, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
