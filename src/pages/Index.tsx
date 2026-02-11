import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Shield, MessageSquare, FileText, CheckCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { motion } from "framer-motion";

export default function Index() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const features = [
    { icon: MessageSquare, title: "Natural Language Q&A", description: "Ask questions in plain language and get precise answers from your policy documents." },
    { icon: FileText, title: "Cited Sources", description: "Every answer includes exact citations with document name, page number, and relevant passage." },
    { icon: CheckCircle, title: "Verified Accuracy", description: "Answers are generated only from your uploaded documents—no hallucinated information." },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <span className="font-semibold text-lg">Policy Oracle</span>
          </div>
          <Button onClick={() => navigate(user ? "/chat" : "/auth")}>
            {user ? "Open App" : "Get Started"}
          </Button>
        </div>
      </header>

      <main>
        <section className="container mx-auto px-4 py-24 text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight max-w-3xl mx-auto leading-tight">
              Your AI-Powered Policy & Compliance Assistant
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
              Upload policy documents, ask questions in plain language, and get cited answers in seconds. Built for government and enterprise teams who need accuracy.
            </p>
            <div className="mt-8 flex gap-4 justify-center">
              <Button size="lg" onClick={() => navigate(user ? "/chat" : "/auth")}>
                {user ? "Start Asking" : "Create Free Account"}
              </Button>
              <Button size="lg" variant="outline" onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}>
                Learn More
              </Button>
            </div>
          </motion.div>
        </section>

        <section id="features" className="container mx-auto px-4 py-16">
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {features.map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                viewport={{ once: true }}
                className="rounded-xl border bg-card p-6 space-y-3"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <feature.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-lg font-semibold">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          Policy Oracle — AI-powered compliance assistant
        </div>
      </footer>
    </div>
  );
}
