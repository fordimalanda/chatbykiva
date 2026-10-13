"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useSocket } from "@/context/SocketContext";
import { api, ChatMessage, UserSummaryItem, ConversationSummary } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { KivaEventTicker } from "@/components/KivaEventTicker";
import { formatTime } from "@/lib/utils";
import {
  Send,
  MessageSquare,
  Users,
  Search,
  Hash,
  Database,
  Radio,
  ExternalLink,
  Shield,
  ArrowLeft,
} from "lucide-react";

function ChatInner() {
  const { user } = useAuth();
  const { socket, connected } = useSocket();
  const searchParams = useSearchParams();

  const initialWith = searchParams.get("with") || "all";
  const [activePartner, setActivePartner] = useState<string>(initialWith);
  const [mobileView, setMobileView] = useState<"contacts" | "chat">(
    searchParams.get("with") ? "chat" : "contacts"
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [users, setUsers] = useState<UserSummaryItem[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [inputContent, setInputContent] = useState("");
  const [sending, setSending] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Load conversations and registered users
  useEffect(() => {
    if (!user) return;
    api.getUsers().then(setUsers).catch(console.error);
    api.getConversations().then(setConversations).catch(console.error);
  }, [user]);

  // Load messages for current conversation
  useEffect(() => {
    if (!user) return;
    const partner = activePartner === "all" ? undefined : activePartner;
    api
      .getMessages(partner)
      .then((data) => {
        setMessages(data);
        setTimeout(scrollToBottom, 100);
      })
      .catch(console.error);
  }, [user, activePartner]);

  // Real-time synchronization: listen for new messages directly from KivaDB stream
  useEffect(() => {
    if (!socket || !user) return;

    const handleNewMessage = (newMsg: ChatMessage) => {
      // Check if message belongs to current chat
      const isRelevant =
        (activePartner === "all" && newMsg.to === "all") ||
        (activePartner !== "all" &&
          ((newMsg.from === user.username && newMsg.to === activePartner) ||
            (newMsg.from === activePartner && newMsg.to === user.username)));

      if (isRelevant) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
        setTimeout(scrollToBottom, 50);
      }

      // Update conversations preview
      api.getConversations().then(setConversations).catch(console.error);
    };

    socket.on("message:new", handleNewMessage);
    socket.on("message:direct", handleNewMessage);

    return () => {
      socket.off("message:new", handleNewMessage);
      socket.off("message:direct", handleNewMessage);
    };
  }, [socket, user, activePartner]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputContent.trim() || sending || !user) return;

    const text = inputContent.trim();
    setInputContent("");
    setSending(true);

    try {
      await api.sendMessage({
        to: activePartner,
        content: text,
      });
    } catch (err: any) {
      alert(err.message || "Erreur d'envoi");
    } finally {
      setSending(false);
    }
  };

  const handleSelectPartner = (partner: string) => {
    setActivePartner(partner);
    setMobileView("chat");
  };

  const filteredUsers = users.filter((u) => {
    if (u.username === user?.username) return false;
    return (
      u.username.toLowerCase().includes(searchFilter.toLowerCase()) ||
      u.displayName.toLowerCase().includes(searchFilter.toLowerCase())
    );
  });

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-6 space-y-4">
      <KivaEventTicker />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-[calc(100dvh-12rem)] md:h-[calc(100vh-11rem)] min-h-[480px]">
        {/* Left Sidebar: Conversations & Contacts */}
        <Card
          className={`lg:col-span-4 p-0 flex flex-col overflow-hidden border-slate-800/90 shadow-2xl bg-slate-900/80 backdrop-blur-xl ${
            mobileView === "chat" ? "hidden lg:flex" : "flex"
          }`}
        >
          {/* Header */}
          <div className="p-3.5 sm:p-4 border-b border-slate-800/80 bg-slate-900/60">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-indigo-400" />
                Messagerie Instantanée
              </h2>
              <Badge variant={connected ? "live" : "secondary"}>
                {connected ? "KivaDB WS" : "Hors-ligne"}
              </Badge>
            </div>
            <div className="relative">
              <Input
                type="text"
                placeholder="Chercher un contact..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="h-9 pl-8 text-xs"
              />
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-3 pointer-events-none" />
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/50 p-2 space-y-1">
            {/* Global Chat Room */}
            <button
              onClick={() => handleSelectPartner("all")}
              className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left ${
                activePartner === "all"
                  ? "bg-indigo-600/20 border border-indigo-500/30 text-white"
                  : "hover:bg-slate-800/50 text-slate-300"
              }`}
            >
              <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shrink-0 shadow-md">
                <Hash className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-white">Salon Général</span>
                  <Badge variant="outline" className="text-[10px] font-mono">
                    public
                  </Badge>
                </div>
                <p className="text-xs text-slate-400 truncate">
                  Messages communautaires ouverts
                </p>
              </div>
            </button>

            {/* Existing Conversations */}
            <div className="pt-2 px-1 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Messages privés (Directs)
            </div>

            {filteredUsers.map((item) => {
              const isActive = activePartner === item.username;
              const convo = conversations.find((c) => c.withUser === item.username);

              return (
                <button
                  key={item.username}
                  onClick={() => handleSelectPartner(item.username)}
                  className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition-all text-left ${
                    isActive
                      ? "bg-indigo-600/20 border border-indigo-500/30 text-white"
                      : "hover:bg-slate-800/50 text-slate-300"
                  }`}
                >
                  <Avatar src={item.avatar} fallback={item.username} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm text-white truncate">
                        {item.displayName}
                      </span>
                      {convo && (
                        <span className="text-[10px] text-slate-400">
                          {formatTime(convo.lastTimestamp)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 truncate">
                      {convo ? convo.lastMessage : `@${item.username}`}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Right Area: Chat Window */}
        <Card
          className={`lg:col-span-8 p-0 flex flex-col overflow-hidden border-slate-800/90 shadow-2xl ${
            mobileView === "contacts" ? "hidden lg:flex" : "flex"
          }`}
        >
          {/* Header */}
          <div className="p-3 sm:p-4 border-b border-slate-800/80 bg-slate-900/60 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              {/* Mobile Back Button */}
              <button
                onClick={() => setMobileView("contacts")}
                className="lg:hidden p-1.5 -ml-1 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                title="Retour aux conversations"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>

              {activePartner === "all" ? (
                <>
                  <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shrink-0">
                    <Hash className="h-5 w-5 text-white" />
                  </div>
                  <div className="truncate">
                    <h3 className="font-bold text-white text-sm sm:text-base truncate">Salon Général</h3>
                    <p className="text-[11px] sm:text-xs text-slate-400 truncate">
                      Diffusion publique KivaDB (msg:&lt;id&gt;)
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <Avatar
                    src={`https://api.dicebear.com/7.x/bottts/svg?seed=${activePartner}`}
                    fallback={activePartner}
                    size="md"
                    className="shrink-0"
                  />
                  <div className="truncate">
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-bold text-white text-sm sm:text-base truncate">@{activePartner}</h3>
                      <Link href={`/profile/${activePartner}`}>
                        <ExternalLink className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-indigo-400 hover:text-indigo-300 shrink-0" />
                      </Link>
                    </div>
                    <p className="text-[10px] sm:text-xs text-emerald-400 flex items-center gap-1 truncate">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                      Canal privé KivaDB
                    </p>
                  </div>
                </>
              )}
            </div>

            <Badge variant="outline" className="font-mono text-[10px] sm:text-xs shrink-0">
              {messages.length} msg
            </Badge>
          </div>

          {/* Messages Feed */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4 bg-slate-950/40">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-2 p-4 text-center">
                <MessageSquare className="h-8 w-8 sm:h-10 sm:w-10 text-slate-600 mb-1" />
                <p className="font-medium text-white text-sm sm:text-base">Aucun message pour l&apos;instant</p>
                <p className="text-xs text-slate-400">
                  Envoyez un message pour initialiser la conversation dans KivaDB.
                </p>
              </div>
            ) : (
              messages.map((m) => {
                const isSentByMe = m.from === user?.username;

                return (
                  <div
                    key={m.id}
                    className={`flex items-end gap-2 ${
                      isSentByMe ? "justify-end" : "justify-start"
                    }`}
                  >
                    {!isSentByMe && (
                      <Link href={`/profile/${m.from}`} className="shrink-0">
                        <Avatar
                          src={`https://api.dicebear.com/7.x/bottts/svg?seed=${m.from}`}
                          fallback={m.from}
                          size="sm"
                        />
                      </Link>
                    )}

                    <div
                      className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-3.5 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm shadow-md transition-all ${
                        isSentByMe
                          ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-br-none"
                          : "bg-slate-800/90 text-slate-100 border border-slate-700/60 rounded-bl-none"
                      }`}
                    >
                      {!isSentByMe && (
                        <p className="text-[10px] sm:text-[11px] font-bold text-indigo-300 mb-1">
                          @{m.from}
                        </p>
                      )}
                      <p className="whitespace-pre-wrap leading-relaxed break-words">{m.content}</p>
                      <div className="flex items-center justify-end gap-1.5 mt-1 text-[9px] sm:text-[10px] text-slate-300/80 font-mono">
                        <span>{formatTime(m.timestamp)}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Footer */}
          <form
            onSubmit={handleSend}
            className="p-2.5 sm:p-3 border-t border-slate-800/80 bg-slate-900/60 flex items-center gap-2"
          >
            <Input
              type="text"
              placeholder={`Écrire à ${
                activePartner === "all" ? "la communauté" : `@${activePartner}`
              }...`}
              value={inputContent}
              onChange={(e) => setInputContent(e.target.value)}
              className="flex-1 bg-slate-950/80 text-xs sm:text-sm h-10"
              autoFocus
            />
            <Button type="submit" size="default" className="gap-1.5 sm:gap-2 shrink-0 h-10 px-3 sm:px-4 text-xs sm:text-sm" isLoading={sending}>
              <Send className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Envoyer</span>
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

export default function MessagesPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[80vh] flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
        </div>
      }
    >
      <ChatInner />
    </Suspense>
  );
}
