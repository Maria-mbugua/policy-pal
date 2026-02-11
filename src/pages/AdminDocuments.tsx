import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, Trash2, Plus, FolderOpen } from "lucide-react";
import { format } from "date-fns";

type Document = {
  id: string;
  title: string;
  file_path: string;
  file_size: number | null;
  page_count: number | null;
  status: string;
  category_id: string | null;
  created_at: string;
};

type Category = {
  id: string;
  name: string;
  description: string | null;
};

export default function AdminDocuments() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [uploading, setUploading] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);

  const fetchData = useCallback(async () => {
    const [docsRes, catsRes] = await Promise.all([
      supabase.from("documents").select("*").order("created_at", { ascending: false }),
      supabase.from("categories").select("*").order("name"),
    ]);
    if (docsRes.data) setDocuments(docsRes.data);
    if (catsRes.data) setCategories(catsRes.data);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.type !== "application/pdf") {
      toast({ title: "Invalid file", description: "Only PDF files are supported", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const filePath = `${user.id}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from("documents").upload(filePath, file);
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase.from("documents").insert({
        title: file.name.replace(".pdf", ""),
        file_path: filePath,
        file_size: file.size,
        uploaded_by: user.id,
        category_id: selectedCategory !== "all" ? selectedCategory : null,
      });
      if (insertError) throw insertError;

      toast({ title: "Document uploaded", description: "Processing will begin shortly." });
      fetchData();

      // Trigger processing
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-document`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ filePath }),
      });
    } catch (error: any) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleDelete = async (doc: Document) => {
    await supabase.storage.from("documents").remove([doc.file_path]);
    await supabase.from("documents").delete().eq("id", doc.id);
    setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
    toast({ title: "Document deleted" });
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim() || !user) return;
    const { error } = await supabase.from("categories").insert({ name: newCategoryName, created_by: user.id });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setNewCategoryName("");
      setShowCategoryDialog(false);
      fetchData();
    }
  };

  const filteredDocs = selectedCategory === "all" ? documents : documents.filter((d) => d.category_id === selectedCategory);

  const statusColor = (status: string) => {
    switch (status) {
      case "processed": return "default";
      case "processing": return "secondary";
      case "error": return "destructive";
      default: return "outline";
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Document Management</h1>
          <p className="text-muted-foreground">Upload and manage policy documents</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={showCategoryDialog} onOpenChange={setShowCategoryDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <FolderOpen className="mr-2 h-4 w-4" /> Add Category
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Category</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder="e.g. HR Policies" />
                </div>
                <Button onClick={handleAddCategory}>Create</Button>
              </div>
            </DialogContent>
          </Dialog>

          <label>
            <Button asChild disabled={uploading}>
              <span>
                <Upload className="mr-2 h-4 w-4" /> {uploading ? "Uploading..." : "Upload PDF"}
              </span>
            </Button>
            <input type="file" accept=".pdf" className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{filteredDocs.length} document{filteredDocs.length !== 1 ? "s" : ""}</span>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Pages</TableHead>
              <TableHead>Uploaded</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredDocs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  No documents uploaded yet
                </TableCell>
              </TableRow>
            ) : (
              filteredDocs.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell className="font-medium">{doc.title}</TableCell>
                  <TableCell>{categories.find((c) => c.id === doc.category_id)?.name || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={statusColor(doc.status) as any}>{doc.status}</Badge>
                  </TableCell>
                  <TableCell>{doc.page_count || "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{format(new Date(doc.created_at), "MMM d, yyyy")}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(doc)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
