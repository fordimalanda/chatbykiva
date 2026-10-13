"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useSocket } from "@/context/SocketContext";
import {
  api,
  ChatMessage,
  UserSummaryItem,
  ConversationSummary,
  ChannelItem,
} from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
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
  Home,
  Lock,
  Globe,
  Plus,
  Trash2,
  Settings,
  AtSign,
  AlertCircle,
  Bell,
  Check,
} from "lucide-react";

function ChatInner() {
  const { user } = useAuth();
  const { socket, connected } = useSocket();
  const searchParams = useSearchParams();

  const initialTarget = searchParams.get("with") || "general";
  const [activePartner, setActivePartner] = useState<string>(initialTarget);
  const [mobileView, setMobileView] = useState<"contacts" | "chat">(
    searchParams.get("with") ? "chat" : "contacts"
  );

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [users, setUsers] = useState<UserSummaryItem[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [inputContent, setInputContent] = useState("");
  const [sending, setSending] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");

  // Create Channel Modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelDesc, setNewChannelDesc] = useState("");
  const [newChannelPrivate, setNewChannelPrivate] = useState(false);
  const [creatingChannel, setCreatingChannel] = useState(false);

  // Edit / Channel Settings Modal state
  const [channelSettingsOpen, setChannelSettingsOpen] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<ChannelItem | null>(null);

  // @ Mention auto-complete state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStartIndex, setMentionStartIndex] = useState<number>(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Load channels, users, and conversations on mount
  useEffect(() => {
    if (!user) return;
    api.getChannels().then(setChannels).catch(console.error);
    api.getUsers().then(setUsers).catch(console.error);
    api.getConversations().then(setConversations).catch(console.error);
  }, [user]);

  // Load messages for current active target (salon or DM)
  useEffect(() => {
    if (!user) return;
    api
      .getMessages(activePartner)
      .then((data) => {
        setMessages(data);
        setTimeout(scrollToBottom, 100);
      })
      .catch(console.error);
  }, [user, activePartner]);

  // Real-time synchronization
  useEffect(() => {
    if (!socket || !user) return;

    const handleNewMessage = (newMsg: ChatMessage) => {
      const msgTo = (newMsg.to || "").toLowerCase();
      const msgFrom = (newMsg.from || "").toLowerCase();
      const current = (user.username || "").toLowerCase();
      const partner = (activePartner || "").toLowerCase();

      // Check if message belongs to current active window
      const isCurrentChannel =
        (partner === "all" || partner === "general") &&
        (msgTo === "all" || msgTo === "general");
      const isExactChannel = partner === msgTo;
      const isDirectWithPartner =
        ((msgFrom === current && msgTo === partner) ||
          (msgFrom === partner && msgTo === current));

      if (isCurrentChannel || isExactChannel || isDirectWithPartner) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
        setTimeout(scrollToBottom, 50);
      }

      // Update conversations preview
      api.getConversations().then(setConversations).catch(console.error);
    };

    const handleChannelNew = (ch: ChannelItem) => {
      setChannels((prev) => {
        if (prev.some((c) => c.id === ch.id)) return prev;
        return [...prev, ch];
      });
    };

    const handleChannelUpdated = (ch: ChannelItem) => {
      setChannels((prev) => prev.map((c) => (c.id === ch.id ? ch : c)));
      if (selectedChannel && selectedChannel.id === ch.id) {
        setSelectedChannel(ch);
      }
    };

    const handleChannelDeleted = ({ id }: { id: string }) => {
      setChannels((prev) => prev.filter((c) => c.id !== id));
      if (activePartner === id) {
        setActivePartner("general");
      }
    };

    socket.on("message:new", handleNewMessage);
    socket.on("message:direct", handleNewMessage);
    socket.on("channel:new", handleChannelNew);
    socket.on("channel:updated", handleChannelUpdated);
    socket.on("channel:deleted", handleChannelDeleted);

    return () => {
      socket.off("message:new", handleNewMessage);
      socket.off("message:direct", handleNewMessage);
      socket.off("channel:new", handleChannelNew);
      socket.off("channel:updated", handleChannelUpdated);
      socket.off("channel:deleted", handleChannelDeleted);
    };
  }, [socket, user, activePartner, selectedChannel]);

  // Handle message sending
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputContent.trim() || sending || !user) return;

    const text = inputContent.trim();
    setInputContent("");
    setMentionQuery(null);
    setSending(true);

    try {
      const sent = await api.sendMessage({
        to: activePartner,
        content: text,
      });

      // Immediate local state append so user sees it with zero latency
      if (sent && sent.id) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === sent.id)) return prev;
          return [...prev, sent];
        });
        setTimeout(scrollToBottom, 50);
      }

      api.getConversations().then(setConversations).catch(console.error);
    } catch (err: any) {
      alert(err.message || "Erreur d'envoi");
    } finally {
      setSending(false);
    }
  };

  // Detect @ mentions while typing
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputContent(val);

    const cursor = e.target.selectionStart || val.length;
    const textBeforeCursor = val.slice(0, cursor);
    const match = textBeforeCursor.match(/@([a-zA-Z0-9_-]*)$/);

    if (match) {
      setMentionQuery(match[1].toLowerCase());
      setMentionStartIndex(cursor - match[0].length);
    } else {
      setMentionQuery(null);
      setMentionStartIndex(-1);
    }
  };

  // Insert selected mention into input
  const handleSelectMention = (targetUsername: string) => {
    if (mentionStartIndex === -1) return;
    const before = inputContent.slice(0, mentionStartIndex);
    const after = inputContent.slice(mentionStartIndex + (mentionQuery?.length || 0) + 1);
    const updated = `${before}@${targetUsername} ${after}`;
    setInputContent(updated);
    setMentionQuery(null);
    setMentionStartIndex(-1);
    inputRef.current?.focus();
  };

  // Create Channel
  const handleCreateChannelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannelName.trim() || creatingChannel) return;

    setCreatingChannel(true);
    try {
      const created = await api.createChannel({
        name: newChannelName.trim(),
        description: newChannelDesc.trim(),
        isPrivate: newChannelPrivate,
      });
      setChannels((prev) => [...prev, created]);
      setActivePartner(created.id);
      setMobileView("chat");
      setCreateModalOpen(false);
      setNewChannelName("");
      setNewChannelDesc("");
      setNewChannelPrivate(false);
    } catch (err: any) {
      alert(err.message || "Erreur lors de la création du salon");
    } finally {
      setCreatingChannel(false);
    }
  };

  // Delete Channel (Admin only)
  const handleDeleteChannel = async (channelId: string) => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer définitivement ce salon de KivaDB ?")) return;

    try {
      await api.deleteChannel(channelId);
      setChannels((prev) => prev.filter((c) => c.id !== channelId));
      if (activePartner === channelId) {
        setActivePartner("general");
      }
      setChannelSettingsOpen(false);
    } catch (err: any) {
      alert(err.message || "Impossible de supprimer le salon");
    }
  };

  // Toggle Channel Visibility (Admin only)
  const handleToggleChannelVisibility = async (channel: ChannelItem) => {
    try {
      const updated = await api.updateChannel(channel.id, {
        isPrivate: !channel.isPrivate,
      });
      setChannels((prev) => prev.map((c) => (c.id === channel.id ? updated : c)));
      setSelectedChannel(updated);
    } catch (err: any) {
      alert(err.message || "Impossible de modifier la visibilité");
    }
  };

  const handleSelectPartner = (partner: string) => {
    setActivePartner(partner);
    setMobileView("chat");
  };

  // Filtered mention suggestions
  const mentionSuggestions =
    mentionQuery !== null
      ? users.filter(
          (u) =>
            u.username.toLowerCase().includes(mentionQuery) ||
            u.displayName.toLowerCase().includes(mentionQuery)
        )
      : [];

  // Active channel details
  const activeChannel = channels.find(
    (c) => c.id === activePartner || (activePartner === "all" && c.id === "general")
  );
  const isChannel = !!activeChannel;
  const isDirect = !isChannel;
  const currentDirectUser = users.find((u) => u.username === activePartner);

  // Admin rights on active channel
  const isChannelAdmin =
    user &&
    activeChannel &&
    ((activeChannel.admins || []).includes(user.username) ||
      activeChannel.creator === user.username);

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8 py-2 sm:py-5 space-y-3">
      {/* Ticker (hidden on phone in chat view to maximize space) */}
      <div className={mobileView === "chat" ? "hidden sm:block" : "block"}>
        <KivaEventTicker />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-5 h-[calc(100dvh-5.5rem)] md:h-[calc(100vh-10rem)] min-h-[480px]">
        {/* Left Sidebar: Community Channels & Direct Chats */}
        <Card
          className={`lg:col-span-4 p-0 flex flex-col overflow-hidden border-slate-800/90 shadow-2xl bg-slate-900/80 backdrop-blur-xl ${
            mobileView === "chat" ? "hidden lg:flex" : "flex"
          }`}
        >
          {/* Header */}
          <div className="p-3 sm:p-4 border-b border-slate-800/80 bg-slate-900/70">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <Link
                  href="/feed"
                  className="sm:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                  title="Retour au fil d'actualité"
                >
                  <Home className="h-4 w-4" />
                </Link>
                <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-indigo-400" />
                  Communauté & Salons
                </h2>
              </div>
              <Badge variant={connected ? "live" : "secondary"}>
                {connected ? "KivaDB WS" : "Hors-ligne"}
              </Badge>
            </div>
            <div className="relative">
              <Input
                type="text"
                placeholder="Chercher un salon ou contact..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="h-8 sm:h-9 pl-8 text-xs bg-slate-950/70"
              />
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2.5 sm:top-3 pointer-events-none" />
            </div>
          </div>

          {/* List Area */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/50 p-2 space-y-2">
            {/* Community Salons Section */}
            <div>
              <div className="flex items-center justify-between px-2 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <span className="flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 text-indigo-400" />
                  Salons ({channels.length})
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCreateModalOpen(true)}
                  className="h-6 px-2 text-[10px] gap-1 text-indigo-400 hover:text-white hover:bg-indigo-600/20 rounded-md"
                >
                  <Plus className="h-3 w-3" />
                  Créer
                </Button>
              </div>

              <div className="space-y-1 mt-1">
                {channels
                  .filter(
                    (c) =>
                      c.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
                      c.id.toLowerCase().includes(searchFilter.toLowerCase())
                  )
                  .map((ch) => {
                    const isActive =
                      activePartner === ch.id ||
                      (activePartner === "all" && ch.id === "general");
                    const isAdmin =
                      user &&
                      ((ch.admins || []).includes(user.username) ||
                        ch.creator === user.username);

                    return (
                      <div
                        key={ch.id}
                        className={`w-full flex items-center justify-between p-2.5 rounded-xl transition-all cursor-pointer ${
                          isActive
                            ? "bg-indigo-600/20 border border-indigo-500/30 text-white"
                            : "hover:bg-slate-800/50 text-slate-300"
                        }`}
                        onClick={() => handleSelectPartner(ch.id)}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div
                            className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                              ch.isPrivate
                                ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                : "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                            }`}
                          >
                            {ch.isPrivate ? (
                              <Lock className="h-4 w-4" />
                            ) : (
                              <Hash className="h-4 w-4" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-xs sm:text-sm text-white truncate">
                                {ch.name}
                              </span>
                              {ch.isPrivate && (
                                <Badge variant="warning" className="text-[9px] px-1.5 py-0 h-4">
                                  Privé
                                </Badge>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400 truncate">
                              {ch.description || "Salon de discussion"}
                            </p>
                          </div>
                        </div>

                        {isAdmin && ch.id !== "general" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedChannel(ch);
                              setChannelSettingsOpen(true);
                            }}
                            className="p-1 rounded-md text-slate-500 hover:text-white hover:bg-slate-700/60 transition-colors"
                            title="Gérer le salon"
                          >
                            <Settings className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Direct Messages Section */}
            <div className="pt-2">
              <div className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-indigo-400" />
                Messages privés (Directs)
              </div>

              <div className="space-y-1 mt-1">
                {users
                  .filter((u) => {
                    if (u.username === user?.username) return false;
                    return (
                      u.username.toLowerCase().includes(searchFilter.toLowerCase()) ||
                      u.displayName.toLowerCase().includes(searchFilter.toLowerCase())
                    );
                  })
                  .map((item) => {
                    const isActive = activePartner === item.username;
                    const convo = conversations.find((c) => c.withUser === item.username);

                    return (
                      <button
                        key={item.username}
                        onClick={() => handleSelectPartner(item.username)}
                        className={`w-full flex items-center gap-2.5 p-2 rounded-xl transition-all text-left ${
                          isActive
                            ? "bg-indigo-600/20 border border-indigo-500/30 text-white"
                            : "hover:bg-slate-800/50 text-slate-300"
                        }`}
                      >
                        <Avatar src={item.avatar} fallback={item.username} size="sm" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-xs sm:text-sm text-white truncate">
                              {item.displayName || item.username}
                            </span>
                            {convo && (
                              <span className="text-[10px] text-slate-400 font-mono">
                                {formatTime(convo.lastTimestamp)}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 truncate">
                            {convo ? convo.lastMessage : `@${item.username}`}
                          </p>
                        </div>
                      </button>
                    );
                  })}
              </div>
            </div>
          </div>
        </Card>

        {/* Right Area: Active Chat Window */}
        <Card
          className={`lg:col-span-8 p-0 flex flex-col overflow-hidden border-slate-800/90 shadow-2xl bg-slate-900/80 backdrop-blur-xl relative ${
            mobileView === "contacts" ? "hidden lg:flex" : "flex"
          }`}
        >
          {/* Header */}
          <div className="p-3 sm:p-4 border-b border-slate-800/80 bg-slate-900/70 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              {/* Mobile Back Button */}
              <button
                onClick={() => setMobileView("contacts")}
                className="lg:hidden p-1.5 -ml-1 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                title="Retour aux salons"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>

              {isChannel ? (
                <>
                  <div
                    className={`h-9 w-9 sm:h-10 sm:w-10 rounded-xl flex items-center justify-center shrink-0 ${
                      activeChannel?.isPrivate
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                        : "bg-gradient-to-tr from-indigo-500 to-purple-600 text-white"
                    }`}
                  >
                    {activeChannel?.isPrivate ? (
                      <Lock className="h-5 w-5" />
                    ) : (
                      <Hash className="h-5 w-5" />
                    )}
                  </div>
                  <div className="truncate">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-white text-sm sm:text-base truncate">
                        {activeChannel?.name}
                      </h3>
                      {activeChannel?.isPrivate && (
                        <Badge variant="warning" className="text-[9px] px-1.5 py-0">
                          Salon Privé
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] sm:text-xs text-slate-400 truncate">
                      {activeChannel?.description || "Salon communautaire KivaDB"}
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
                      <h3 className="font-bold text-white text-sm sm:text-base truncate">
                        {currentDirectUser?.displayName || activePartner}
                      </h3>
                      <span className="text-xs text-indigo-400 font-mono">@{activePartner}</span>
                      <Link href={`/profile/${activePartner}`}>
                        <ExternalLink className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-indigo-400 hover:text-indigo-300 shrink-0" />
                      </Link>
                    </div>
                    <p className="text-[10px] sm:text-xs text-emerald-400 flex items-center gap-1 truncate">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                      Conversation privée chiffrée
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              {isChannelAdmin && activeChannel && activeChannel.id !== "general" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedChannel(activeChannel);
                    setChannelSettingsOpen(true);
                  }}
                  className="h-8 px-2.5 text-xs gap-1.5 border-slate-700"
                >
                  <Settings className="h-3.5 w-3.5 text-indigo-400" />
                  <span className="hidden sm:inline">Gérer</span>
                </Button>
              )}
              <Badge variant="outline" className="font-mono text-[10px] sm:text-xs shrink-0">
                {messages.length} msg
              </Badge>
            </div>
          </div>

          {/* Messages Feed */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4 bg-slate-950/50">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-2 p-4 text-center">
                <MessageSquare className="h-9 w-9 sm:h-11 sm:w-11 text-slate-600 mb-1" />
                <p className="font-bold text-white text-sm sm:text-base">Aucun message pour l&apos;instant</p>
                <p className="text-xs text-slate-400 max-w-sm">
                  {isChannel
                    ? `Partagez le premier message dans ${activeChannel?.name || "ce salon"} ! Utilisez @ pour mentionner un membre.`
                    : `Commencez votre conversation privée avec ${currentDirectUser?.displayName || activePartner}.`}
                </p>
              </div>
            ) : (
              messages.map((m) => {
                const isSentByMe = m.from === user?.username;
                const isMentioned = user && Array.isArray(m.mentions) && m.mentions.includes(user.username);
                const displayName = m.fromDisplayName || m.from;

                return (
                  <div
                    key={m.id}
                    className={`flex items-end gap-2.5 ${
                      isSentByMe ? "justify-end" : "justify-start"
                    }`}
                  >
                    {!isSentByMe && (
                      <Link href={`/profile/${m.from}`} className="shrink-0 mb-1">
                        <Avatar
                          src={m.fromAvatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${m.from}`}
                          fallback={m.from}
                          size="sm"
                        />
                      </Link>
                    )}

                    <div
                      className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-3.5 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm shadow-md transition-all ${
                        isSentByMe
                          ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-br-none"
                          : isMentioned
                          ? "bg-slate-900 border-2 border-amber-500/80 text-slate-100 rounded-bl-none shadow-amber-500/10 shadow-lg"
                          : "bg-slate-800/90 text-slate-100 border border-slate-700/60 rounded-bl-none"
                      }`}
                    >
                      {/* Full Name & Mention Badge */}
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`font-bold text-xs sm:text-sm ${
                              isSentByMe ? "text-indigo-100" : "text-indigo-300"
                            }`}
                          >
                            {displayName}
                          </span>
                          {!isSentByMe && (
                            <span className="text-[10px] text-slate-400 font-mono">
                              @{m.from}
                            </span>
                          )}
                        </div>
                        {isMentioned && !isSentByMe && (
                          <Badge variant="warning" className="text-[9px] px-1.5 py-0 h-4">
                            @Vous mentionne
                          </Badge>
                        )}
                      </div>

                      <p className="whitespace-pre-wrap leading-relaxed break-words text-xs sm:text-sm">
                        {m.content}
                      </p>

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

          {/* @ Mention Suggestions Popup */}
          {mentionQuery !== null && mentionSuggestions.length > 0 && (
            <div className="absolute bottom-16 left-3 right-3 sm:left-4 sm:right-auto sm:w-80 max-h-48 overflow-y-auto rounded-xl bg-slate-900/95 border border-indigo-500/40 shadow-2xl backdrop-blur-xl p-1 z-30 divide-y divide-slate-800/60">
              <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <AtSign className="h-3 w-3 text-indigo-400" />
                Mentionner un utilisateur
              </div>
              {mentionSuggestions.slice(0, 5).map((sug) => (
                <button
                  key={sug.username}
                  type="button"
                  onClick={() => handleSelectMention(sug.username)}
                  className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-slate-800/80 transition-colors text-left"
                >
                  <Avatar src={sug.avatar} fallback={sug.username} size="sm" />
                  <div className="truncate flex-1">
                    <p className="text-xs font-bold text-white truncate">{sug.displayName}</p>
                    <p className="text-[10px] text-indigo-300 font-mono">@{sug.username}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Input Footer */}
          <form
            onSubmit={handleSend}
            className="p-2.5 sm:p-3 border-t border-slate-800/80 bg-slate-900/80 flex items-center gap-2"
          >
            <div className="relative flex-1">
              <Input
                ref={inputRef}
                type="text"
                placeholder={
                  isChannel
                    ? `Écrire dans ${activeChannel?.name}... Tapez @ pour mentionner`
                    : `Écrire à ${currentDirectUser?.displayName || activePartner}... Tapez @ pour mentionner`
                }
                value={inputContent}
                onChange={handleInputChange}
                className="w-full bg-slate-950/90 text-xs sm:text-sm h-10 border-slate-700/80 pr-8"
                autoFocus
              />
              <button
                type="button"
                onClick={() => {
                  setInputContent((prev) => prev + "@");
                  setMentionQuery("");
                  setMentionStartIndex(inputContent.length);
                  inputRef.current?.focus();
                }}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-indigo-300"
                title="Mentionner avec @"
              >
                <AtSign className="h-4 w-4" />
              </button>
            </div>
            <Button
              type="submit"
              size="default"
              className="gap-1.5 sm:gap-2 shrink-0 h-10 px-3.5 sm:px-4 text-xs sm:text-sm shadow-md shadow-indigo-500/20"
              isLoading={sending}
            >
              <Send className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Envoyer</span>
            </Button>
          </form>
        </Card>
      </div>

      {/* Modal: Créer un salon */}
      <Dialog
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        title="Créer un nouveau salon"
        description="Créez un salon public ou privé pour votre communauté KivaSocial."
      >
        <form onSubmit={handleCreateChannelSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Nom du salon *
            </label>
            <Input
              type="text"
              placeholder="ex: Tech & Développeurs, Jeux Vidéo..."
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Description (Optionnel)
            </label>
            <Input
              type="text"
              placeholder="ex: Salon d'échange sur les technologies et le code"
              value={newChannelDesc}
              onChange={(e) => setNewChannelDesc(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/40 border border-slate-700/60">
            <input
              type="checkbox"
              id="isPrivateCheck"
              checked={newChannelPrivate}
              onChange={(e) => setNewChannelPrivate(e.target.checked)}
              className="h-4 w-4 rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 bg-slate-900"
            />
            <label htmlFor="isPrivateCheck" className="text-xs text-slate-300 cursor-pointer">
              <span className="font-bold text-white block">Salon Privé</span>
              Seuls les administrateurs et membres autorisés pourront voir et discuter.
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateModalOpen(false)}
            >
              Annuler
            </Button>
            <Button type="submit" isLoading={creatingChannel} className="gap-2">
              <Plus className="h-4 w-4" />
              Créer le salon
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Modal: Gérer le salon (Droits administrateur) */}
      {selectedChannel && (
        <Dialog
          open={channelSettingsOpen}
          onOpenChange={setChannelSettingsOpen}
          title={`Paramètres : ${selectedChannel.name}`}
          description={`Géré par ${selectedChannel.creator}. Seuls les administrateurs peuvent modifier ce salon.`}
        >
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Créateur du salon :</span>
                <span className="font-semibold text-white font-mono">@{selectedChannel.creator}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Visibilité actuelle :</span>
                <Badge variant={selectedChannel.isPrivate ? "warning" : "default"}>
                  {selectedChannel.isPrivate ? "Privé" : "Public"}
                </Badge>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Clé KivaDB :</span>
                <span className="font-mono text-indigo-300">channel:{selectedChannel.id}</span>
              </div>
            </div>

            {/* Admin actions */}
            <div className="space-y-2 pt-2">
              <Button
                variant="outline"
                className="w-full justify-between text-xs"
                onClick={() => handleToggleChannelVisibility(selectedChannel)}
              >
                <span>Changer la visibilité :</span>
                <span className="font-bold text-indigo-400">
                  {selectedChannel.isPrivate ? "Rendre Public" : "Rendre Privé"}
                </span>
              </Button>

              <Button
                variant="destructive"
                className="w-full gap-2 text-xs"
                onClick={() => handleDeleteChannel(selectedChannel.id)}
              >
                <Trash2 className="h-4 w-4" />
                Supprimer définitivement ce salon
              </Button>
            </div>
          </div>
        </Dialog>
      )}
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
