import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { filePath } = await req.json();
    if (!filePath) throw new Error("filePath is required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get document record
    const { data: doc } = await supabase
      .from("documents")
      .select("*")
      .eq("file_path", filePath)
      .single();

    if (!doc) throw new Error("Document not found");

    // Update status to processing
    await supabase.from("documents").update({ status: "processing" }).eq("id", doc.id);

    // Download the file
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("documents")
      .download(filePath);

    if (downloadError || !fileData) {
      await supabase.from("documents").update({ status: "error" }).eq("id", doc.id);
      throw new Error("Failed to download file");
    }

    // Extract text from PDF using basic text extraction
    // For production, you'd want a proper PDF parser library
    const arrayBuffer = await fileData.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    
    // Simple text extraction from PDF
    let extractedText = "";
    const textDecoder = new TextDecoder("utf-8", { fatal: false });
    const rawText = textDecoder.decode(bytes);
    
    // Extract text between stream markers in PDF
    const streamRegex = /stream\s*\n([\s\S]*?)\nendstream/g;
    let match;
    while ((match = streamRegex.exec(rawText)) !== null) {
      const streamContent = match[1];
      // Try to extract readable text
      const textMatches = streamContent.match(/\((.*?)\)/g);
      if (textMatches) {
        for (const tm of textMatches) {
          const cleaned = tm.slice(1, -1)
            .replace(/\\n/g, "\n")
            .replace(/\\r/g, "")
            .replace(/\\\\/g, "\\")
            .replace(/\\'/g, "'")
            .replace(/\\"/g, '"');
          if (cleaned.length > 1 && /[a-zA-Z]/.test(cleaned)) {
            extractedText += cleaned + " ";
          }
        }
      }
      // Also try TJ operator text
      const tjMatches = streamContent.match(/\[(.*?)\]\s*TJ/g);
      if (tjMatches) {
        for (const tj of tjMatches) {
          const innerMatches = tj.match(/\((.*?)\)/g);
          if (innerMatches) {
            for (const im of innerMatches) {
              const cleaned = im.slice(1, -1);
              if (cleaned.length > 0) {
                extractedText += cleaned;
              }
            }
            extractedText += " ";
          }
        }
      }
    }

    // If basic extraction failed, use the raw content as fallback
    if (extractedText.trim().length < 50) {
      // Try a simpler approach - look for readable ASCII sequences
      extractedText = rawText
        .replace(/[^\x20-\x7E\n]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    // Chunk the text
    const chunkSize = 1000;
    const overlap = 200;
    const chunks: { content: string; page_number: number; chunk_index: number }[] = [];
    
    let pageEstimate = 1;
    const charsPerPage = Math.max(1, Math.floor(extractedText.length / Math.max(1, doc.page_count || 10)));

    for (let i = 0; i < extractedText.length; i += chunkSize - overlap) {
      const chunkContent = extractedText.slice(i, i + chunkSize).trim();
      if (chunkContent.length < 20) continue;
      
      pageEstimate = Math.floor(i / charsPerPage) + 1;
      chunks.push({
        content: chunkContent,
        page_number: pageEstimate,
        chunk_index: chunks.length,
      });
    }

    // Insert chunks
    if (chunks.length > 0) {
      const { error: chunksError } = await supabase.from("document_chunks").insert(
        chunks.map((c) => ({
          document_id: doc.id,
          content: c.content,
          page_number: c.page_number,
          chunk_index: c.chunk_index,
        }))
      );

      if (chunksError) {
        console.error("Chunks insert error:", chunksError);
        await supabase.from("documents").update({ status: "error" }).eq("id", doc.id);
        throw chunksError;
      }
    }

    // Update document status
    await supabase.from("documents").update({
      status: "processed",
      page_count: pageEstimate,
    }).eq("id", doc.id);

    return new Response(
      JSON.stringify({ success: true, chunks: chunks.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("process-document error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
