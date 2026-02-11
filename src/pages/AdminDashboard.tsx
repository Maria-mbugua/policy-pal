import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, MessageSquare, Users, TrendingUp } from "lucide-react";

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    totalDocuments: 0,
    totalConversations: 0,
    totalMessages: 0,
    totalUsers: 0,
  });

  useEffect(() => {
    const fetchStats = async () => {
      const [docs, convs, msgs, users] = await Promise.all([
        supabase.from("documents").select("id", { count: "exact", head: true }),
        supabase.from("conversations").select("id", { count: "exact", head: true }),
        supabase.from("messages").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
      ]);
      setStats({
        totalDocuments: docs.count || 0,
        totalConversations: convs.count || 0,
        totalMessages: msgs.count || 0,
        totalUsers: users.count || 0,
      });
    };
    fetchStats();
  }, []);

  const statCards = [
    { label: "Documents", value: stats.totalDocuments, icon: FileText, color: "text-primary" },
    { label: "Conversations", value: stats.totalConversations, icon: MessageSquare, color: "text-accent" },
    { label: "Messages", value: stats.totalMessages, icon: TrendingUp, color: "text-primary" },
    { label: "Users", value: stats.totalUsers, icon: Users, color: "text-accent" },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground">Platform overview and analytics</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
