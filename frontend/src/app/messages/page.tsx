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
  CommunityItem,
  SalonItem,
  SalonVisibility,
  MessageAttachment,
  getBackendUrl,
} from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { KivaEventTicker } from "@/components/KivaEventTicker";
import { VoiceMessagePlayer } from "@/components/VoiceMessagePlayer";
import { formatTime, dayLabel, lastSeenLabel, cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import {
  Send,
  MessageSquare,
  Users,
  Search,
  Hash,
  ArrowLeft,
  Home,
  Lock,
  EyeOff,
  Plus,
  Trash2,
  Settings,
  AtSign,
  AlertCircle,
  Bell,
  Check,
  CheckCheck,
  X,
  UserPlus,
  Crown,
  ExternalLink,
  Paperclip,
  Mic,
  Square,
  Download,
  FileText,
  Image as ImageIcon,
  Film,
  ChevronUp,
} from "lucide-react";

function ChatInner() {
  const { user } = useAuth();
  const { socket, connected, isOnline, lastSeen } = useSocket();
  const searchParams = useSearchParams();

  const initialTarget = searchParams.get("with") || "general";
  const [activePartner, setActivePartner] = useState<string>(initialTarget);
  const [mobileView, setMobileView] = useState<"contacts" | "chat">(
    searchParams.get("with") ? "chat" : "contacts"
  );

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(true);
  // "en train d'écrire…" : username -> timestamp d'expiration
  const [typingUsers, setTypingUsers] = useState<Record<string, number>>({});
  const typingSentRef = useRef<{ to: string; at: number } | null>(null);
  const scrollBoxRef = useRef<HTMLDivElement>(null);
  // Message dont les actions sont affichées (appui sur mobile, survol sur desktop)
  const [actionMsgId, setActionMsgId] = useState<string | null>(null);
  const [communities, setCommunities] = useState<CommunityItem[]>([]);
  const [selectedCommunityId, setSelectedCommunityId] = useState<string>("comm-general");
  const [salonsMap, setSalonsMap] = useState<Record<string, SalonItem[]>>({});
  const [users, setUsers] = useState<UserSummaryItem[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [inputContent, setInputContent] = useState("");
  const [sending, setSending] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");

  // Media attachments & voice recording state
  const [pendingAttachments, setPendingAttachments] = useState<MessageAttachment[]>([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Modals state: Community
  const [createCommunityOpen, setCreateCommunityOpen] = useState(false);
  const [newCommName, setNewCommName] = useState("");
  const [newCommDesc, setNewCommDesc] = useState("");
  const [newCommPrivate, setNewCommPrivate] = useState(false);
  const [creatingComm, setCreatingComm] = useState(false);

  const [communitySettingsOpen, setCommunitySettingsOpen] = useState(false);
  const [selectedComm, setSelectedComm] = useState<CommunityItem | null>(null);
  const [inviteUsernameInput, setInviteUsernameInput] = useState("");

  // Modals state: Salon
  const [createSalonOpen, setCreateSalonOpen] = useState(false);
  const [newSalonName, setNewSalonName] = useState("");
  const [newSalonDesc, setNewSalonDesc] = useState("");
  const [newSalonVisibility, setNewSalonVisibility] = useState<SalonVisibility>("public");
  const [creatingSalon, setCreatingSalon] = useState(false);

  const [salonSettingsOpen, setSalonSettingsOpen] = useState(false);
  const [selectedSalon, setSelectedSalon] = useState<SalonItem | null>(null);
  const [addMemberInput, setAddMemberInput] = useState("");

  // Join Request Prompt for visible_private salon
  const [requestJoinSalonPrompt, setRequestJoinSalonPrompt] = useState<SalonItem | null>(null);

  // @ Mention auto-complete state (salons only!)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStartIndex, setMentionStartIndex] = useState<number>(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  /**
   * Transforme le texte en JSX avec liens colorés et cliquables vers le profil.
   */
  const renderMessageContent = (content: string, isSentByMe: boolean) => {
    const parts = content.split(/(@[a-zA-Z0-9_-]+)/g);
    return parts.map((part, i) => {
      if (/^@[a-zA-Z0-9_-]+$/.test(part)) {
        const username = part.slice(1);
        return (
          <Link
            key={i}
            href={`/profile/${username}`}
            className={`inline-flex items-center gap-0.5 font-bold rounded px-0.5 transition-all hover:underline ${
              isSentByMe
                ? "text-indigo-100 bg-white/10 hover:bg-white/20"
                : "text-amber-300 bg-amber-500/15 hover:bg-amber-500/25"
            }`}
          >
            {part}
          </Link>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  // Charger les données initiales
  const loadCommunitiesAndSalons = async () => {
    try {
      const commList = await api.getCommunities();
      setCommunities(commList);

      const activeComm = commList.find((c) => c.id === selectedCommunityId) || commList[0];
      if (activeComm) {
        setSelectedCommunityId(activeComm.id);
        const slns = await api.getSalons(activeComm.id);
        setSalonsMap((prev) => ({ ...prev, [activeComm.id]: slns }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (!user) return;
    loadCommunitiesAndSalons();
    api.getUsers().then(setUsers).catch(console.error);
    api.getConversations().then(setConversations).catch(console.error);
  }, [user]);

  // Recharger les salons si la communauté active change
  useEffect(() => {
    if (!selectedCommunityId) return;
    api.getSalons(selectedCommunityId).then((slns) => {
      setSalonsMap((prev) => ({ ...prev, [selectedCommunityId]: slns }));
    }).catch(console.error);
  }, [selectedCommunityId]);

  // Load messages for current active target & mark as read
  useEffect(() => {
    if (!user) return;
    setMessagesLoading(true);
    setTypingUsers({});
    api
      .getMessagesPage(activePartner)
      .then((page) => {
        setMessages(page.messages);
        setHasMoreHistory(page.hasMore);
        setTimeout(scrollToBottom, 60);
      })
      .catch((err) => {
        setMessages([]);
        setHasMoreHistory(false);
        toast.error(err.message);
      })
      .finally(() => setMessagesLoading(false));

    // If it's a direct message partner, explicitly mark messages as read
    const isChannelTarget =
      activePartner === "all" ||
      activePartner === "general" ||
      activePartner.startsWith("s-") ||
      activePartner.startsWith("comm-");

    if (!isChannelTarget) {
      api.markMessagesAsRead(activePartner).catch(console.error);
    }
  }, [user, activePartner]);

  // Real-time synchronization
  useEffect(() => {
    if (!socket || !user) return;

    const handleNewMessage = (newMsg: ChatMessage) => {
      const msgTo = (newMsg.to || "").toLowerCase();
      const msgFrom = (newMsg.from || "").toLowerCase();
      const current = (user.username || "").toLowerCase();
      const partner = (activePartner || "").toLowerCase();

      const isCurrentChannel =
        (partner === "all" || partner === "general") &&
        (msgTo === "all" || msgTo === "general");
      const isExactChannel = partner === msgTo;
      const isDirectWithPartner =
        ((msgFrom === current && msgTo === partner) ||
          (msgFrom === partner && msgTo === current));

      if (isCurrentChannel || isExactChannel || isDirectWithPartner) {
        setTypingUsers((prev) => {
          if (!prev[msgFrom]) return prev;
          const next = { ...prev };
          delete next[msgFrom];
          return next;
        });
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
        setTimeout(scrollToBottom, 50);

        // If I received a direct message in the active window, mark it as read immediately!
        if (msgFrom === partner && msgTo === current) {
          api.markMessagesAsRead(partner).catch(console.error);
        }
      }

      api.getConversations().then(setConversations).catch(console.error);
    };

    // Live Read Receipts: when recipient views my message, turn checkmarks blue!
    const handleMessageRead = ({ reader, partner, messageIds }: any) => {
      const current = (user.username || "").toLowerCase();
      if (partner?.toLowerCase() === current) {
        setMessages((prev) =>
          prev.map((m) => {
            if (messageIds?.includes(m.id) || (m.from.toLowerCase() === current && m.to.toLowerCase() === reader.toLowerCase())) {
              return { ...m, read: true, readAt: Date.now() };
            }
            return m;
          })
        );
      }
    };

    const handleCommunityUpdate = () => {
      loadCommunitiesAndSalons();
    };

    const handleSalonUpdate = () => {
      if (selectedCommunityId) {
        api.getSalons(selectedCommunityId).then((slns) => {
          setSalonsMap((prev) => ({ ...prev, [selectedCommunityId]: slns }));
        }).catch(console.error);
      }
    };

    const handleMessageDeleted = (deleted: ChatMessage) => {
      setMessages((prev) => prev.map((m) => (m.id === deleted.id ? { ...m, ...deleted } : m)));
    };

    const handleTyping = ({ from, to, isTyping }: { from: string; to: string; isTyping: boolean }) => {
      const current = (user.username || "").toLowerCase();
      const partner = (activePartner || "").toLowerCase();
      const relevant = to === partner || (to === current && from === partner);
      if (!relevant || from === current) return;
      setTypingUsers((prev) => {
        const next = { ...prev };
        if (isTyping) next[from] = Date.now() + 4000;
        else delete next[from];
        return next;
      });
    };

    socket.on("message:deleted", handleMessageDeleted);
    socket.on("typing", handleTyping);
    socket.on("message:new", handleNewMessage);
    socket.on("message:direct", handleNewMessage);
    socket.on("message:read", handleMessageRead);
    socket.on("community:new", handleCommunityUpdate);
    socket.on("community:updated", handleCommunityUpdate);
    socket.on("community:deleted", handleCommunityUpdate);
    socket.on("salon:new", handleSalonUpdate);
    socket.on("salon:updated", handleSalonUpdate);
    socket.on("salon:deleted", handleSalonUpdate);

    return () => {
      socket.off("message:deleted", handleMessageDeleted);
      socket.off("typing", handleTyping);
      socket.off("message:new", handleNewMessage);
      socket.off("message:direct", handleNewMessage);
      socket.off("message:read", handleMessageRead);
      socket.off("community:new", handleCommunityUpdate);
      socket.off("community:updated", handleCommunityUpdate);
      socket.off("community:deleted", handleCommunityUpdate);
      socket.off("salon:new", handleSalonUpdate);
      socket.off("salon:updated", handleSalonUpdate);
      socket.off("salon:deleted", handleSalonUpdate);
    };
  }, [socket, user, activePartner, selectedCommunityId]);

  // Current community & salon states
  const currentComm = communities.find((c) => c.id === selectedCommunityId) || communities[0];
  const currentSalons = currentComm ? salonsMap[currentComm.id] || [] : [];

  // Active Salon if target is a salon
  const activeSalon = currentSalons.find(
    (s) => s.id === activePartner || (activePartner === "general" && s.id === "general")
  );
  const isSalon = !!activeSalon;
  const isDirect = !isSalon;
  const currentDirectUser = users.find((u) => u.username === activePartner);

  // Permissions for active community
  const isCommAdmin =
    user &&
    currentComm &&
    (currentComm.creator.toLowerCase() === user.username.toLowerCase() ||
      (currentComm.admins || []).map((a) => a.toLowerCase()).includes(user.username.toLowerCase()));

  const isCommCreator =
    user && currentComm && currentComm.creator.toLowerCase() === user.username.toLowerCase();

  // Permissions for active salon
  const isSalonAdmin =
    user &&
    activeSalon &&
    (isCommAdmin ||
      activeSalon.creator.toLowerCase() === user.username.toLowerCase());

  // Pending invites for current user across communities
  const myPendingInvites = communities.filter(
    (c) =>
      user &&
      Array.isArray(c.pendingInvites) &&
      c.pendingInvites.map((u) => u.toLowerCase()).includes(user.username.toLowerCase())
  );

  // Voice recording handlers
  const startRecording = async () => {
    try {
      // Polyfill: some old mobile browsers expose getUserMedia on navigator directly
      const getUserMedia =
        navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices) ||
        (navigator as any).getUserMedia?.bind(navigator) ||
        (navigator as any).webkitGetUserMedia?.bind(navigator) ||
        (navigator as any).mozGetUserMedia?.bind(navigator);

      if (!getUserMedia) {
        const isHttp = window.location.protocol === "http:";
        if (isHttp) {
          toast.error(
            "L'enregistrement vocal nécessite une connexion sécurisée (HTTPS). " +
            "Veuillez accéder au site via HTTPS ou depuis localhost."
          );
        } else {
          toast.error(
            "Votre navigateur ne supporte pas l'enregistrement audio. " +
            "Essayez Chrome ou Firefox sur Android, ou Safari sur iOS 14.3+."
          );
        }
        return;
      }

      let stream: MediaStream;
      if (navigator.mediaDevices?.getUserMedia) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } else {
        // Legacy callback-based API
        stream = await new Promise<MediaStream>((resolve, reject) => {
          getUserMedia({ audio: true }, resolve, reject);
        });
      }

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(200);
      setIsRecording(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      toast.error("Accès au microphone requis pour enregistrer un message vocal : " + err.message);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
    }
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    setIsRecording(false);
    setRecordingSeconds(0);
    audioChunksRef.current = [];
  };

  const stopAndSendRecording = async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;

    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    const duration = recordingSeconds;

    recorder.onstop = async () => {
      recorder.stream.getTracks().forEach((track) => track.stop());
      const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
      setIsRecording(false);
      setRecordingSeconds(0);
      audioChunksRef.current = [];

      try {
        setSending(true);
        const uploaded = await api.uploadFile(audioBlob, `vocal_${Date.now()}.webm`);
        uploaded.duration = duration;

        const sent = await api.sendMessage({
          to: activePartner,
          content: "",
          attachments: [uploaded],
        });

        if (sent && sent.id) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === sent.id)) return prev;
            return [...prev, sent];
          });
          setTimeout(scrollToBottom, 50);
        }
      } catch (err: any) {
        toast.error("Erreur lors de l'envoi du message vocal : " + err.message);
      } finally {
        setSending(false);
      }
    };

    recorder.stop();
  };

  // File selection for photos, videos, documents
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingAttachment(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const uploaded = await api.uploadFile(file);
        setPendingAttachments((prev) => [...prev, uploaded]);
      }
    } catch (err: any) {
      toast.error("Erreur d'upload : " + err.message);
    } finally {
      setUploadingAttachment(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removePendingAttachment = (index: number) => {
    setPendingAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  // Send message
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!inputContent.trim() && pendingAttachments.length === 0) || sending || !user) return;

    const text = inputContent.trim();
    const attachmentsToSend = [...pendingAttachments];

    setInputContent("");
    setPendingAttachments([]);
    setMentionQuery(null);
    emitTyping(false);
    setSending(true);

    try {
      const sent = await api.sendMessage({
        to: activePartner,
        content: text,
        attachments: attachmentsToSend,
      });

      if (sent && sent.id) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === sent.id)) return prev;
          return [...prev, sent];
        });
        setTimeout(scrollToBottom, 50);
      }

      api.getConversations().then(setConversations).catch(console.error);
    } catch (err: any) {
      toast.error(err.message || "Erreur d'envoi");
    } finally {
      setSending(false);
    }
  };

  // Handle typing: mention triggers ONLY in salons!
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputContent(val);
    emitTyping(val.trim().length > 0);

    if (!isSalon) {
      setMentionQuery(null);
      setMentionStartIndex(-1);
      return;
    }

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

  const mentionSuggestions =
    isSalon && mentionQuery !== null
      ? users.filter(
          (u) =>
            u.username.toLowerCase().includes(mentionQuery) ||
            u.displayName.toLowerCase().includes(mentionQuery)
        )
      : [];

  // Mode d'affichage mobile exposé au CSS global : liste (avec barre d'onglets) ou conversation plein écran
  useEffect(() => {
    document.body.dataset.chat = mobileView === "chat" ? "open" : "list";
    return () => {
      delete document.body.dataset.chat;
    };
  }, [mobileView]);

  // Expire les indicateurs de frappe périmés
  useEffect(() => {
    if (Object.keys(typingUsers).length === 0) return;
    const t = setInterval(() => {
      setTypingUsers((prev) => {
        const now = Date.now();
        const next = Object.fromEntries(Object.entries(prev).filter(([, until]) => until > now));
        return Object.keys(next).length === Object.keys(prev).length ? prev : next;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [typingUsers]);

  const emitTyping = (isTyping: boolean) => {
    if (!socket) return;
    const last = typingSentRef.current;
    const now = Date.now();
    if (isTyping && last && last.to === activePartner && now - last.at < 2500) return;
    typingSentRef.current = isTyping ? { to: activePartner, at: now } : null;
    socket.emit("typing", { to: activePartner, isTyping });
  };

  const loadOlderMessages = async () => {
    if (loadingHistory || messages.length === 0) return;
    setLoadingHistory(true);
    const box = scrollBoxRef.current;
    const prevHeight = box?.scrollHeight || 0;
    try {
      const page = await api.getMessagesPage(activePartner, messages[0].timestamp);
      setMessages((prev) => [...page.messages.filter((m) => !prev.some((p) => p.id === m.id)), ...prev]);
      setHasMoreHistory(page.hasMore);
      // Conserver la position de lecture après l'ajout en haut
      requestAnimationFrame(() => {
        if (box) box.scrollTop = box.scrollHeight - prevHeight;
      });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleDeleteMessage = async (m: ChatMessage) => {
    if (!confirm("Supprimer ce message pour tout le monde ?")) return;
    try {
      const deleted = await api.deleteMessage(m.id);
      setMessages((prev) => prev.map((x) => (x.id === deleted.id ? { ...x, ...deleted } : x)));
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const typingNames = Object.keys(typingUsers);
  const typingLabel =
    typingNames.length === 0
      ? null
      : typingNames.length === 1
      ? `${users.find((u) => u.username === typingNames[0])?.displayName || typingNames[0]} est en train d'écrire`
      : `${typingNames.length} personnes écrivent`;

  const handleSelectPartner = (partner: string) => {
    setActivePartner(partner);
    setMobileView("chat");
  };

  const handleSelectSalon = (salon: SalonItem) => {
    const isMemberOfSalon =
      user &&
      Array.isArray(salon.members) &&
      salon.members.map((m) => m.toLowerCase()).includes(user.username.toLowerCase());

    if (salon.visibility === "visible_private" && !isMemberOfSalon && !isCommAdmin) {
      setRequestJoinSalonPrompt(salon);
      return;
    }

    handleSelectPartner(salon.id);
  };

  // Actions: Communities
  const handleCreateCommunitySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommName.trim() || creatingComm) return;

    setCreatingComm(true);
    try {
      const created = await api.createCommunity({
        name: newCommName.trim(),
        description: newCommDesc.trim(),
        isPrivate: newCommPrivate,
      });
      await loadCommunitiesAndSalons();
      setSelectedCommunityId(created.id);
      setCreateCommunityOpen(false);
      setNewCommName("");
      setNewCommDesc("");
      setNewCommPrivate(false);
    } catch (err: any) {
      toast.error(err.message || "Erreur de création de la communauté");
    } finally {
      setCreatingComm(false);
    }
  };

  const handleInviteUserToComm = async () => {
    if (!selectedComm || !inviteUsernameInput.trim()) return;
    try {
      await api.inviteToCommunity(selectedComm.id, inviteUsernameInput.trim());
      toast.success(`Invitation envoyée à @${inviteUsernameInput.trim()} !`);
      setInviteUsernameInput("");
      await loadCommunitiesAndSalons();
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de l'invitation");
    }
  };

  const handleRespondCommInvite = async (commId: string, accept: boolean) => {
    try {
      await api.respondToCommunityInvite(commId, accept);
      await loadCommunitiesAndSalons();
      if (accept) {
        setSelectedCommunityId(commId);
      }
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de la réponse");
    }
  };

  const handleToggleAdmin = async (targetUsername: string) => {
    if (!selectedComm) return;
    try {
      const updated = await api.toggleCommunityAdmin(selectedComm.id, targetUsername);
      setSelectedComm(updated);
      await loadCommunitiesAndSalons();
    } catch (err: any) {
      toast.error(err.message || "Erreur de modification des administrateurs");
    }
  };

  const handleDeleteCommunity = async (commId: string) => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer définitivement cette communauté et tous ses salons ?")) return;
    try {
      await api.deleteCommunity(commId);
      await loadCommunitiesAndSalons();
      setCommunitySettingsOpen(false);
      setSelectedCommunityId("comm-general");
      setActivePartner("general");
    } catch (err: any) {
      toast.error(err.message || "Impossible de supprimer la communauté");
    }
  };

  // Actions: Salons
  const handleCreateSalonSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSalonName.trim() || creatingSalon || !currentComm) return;

    setCreatingSalon(true);
    try {
      const created = await api.createSalon(currentComm.id, {
        name: newSalonName.trim(),
        description: newSalonDesc.trim(),
        visibility: newSalonVisibility,
      });

      const updated = await api.getSalons(currentComm.id);
      setSalonsMap((prev) => ({ ...prev, [currentComm.id]: updated }));
      setActivePartner(created.id);
      setMobileView("chat");
      setCreateSalonOpen(false);
      setNewSalonName("");
      setNewSalonDesc("");
      setNewSalonVisibility("public");
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de la création du salon");
    } finally {
      setCreatingSalon(false);
    }
  };

  const handleAddMemberToSalon = async () => {
    if (!selectedSalon || !addMemberInput.trim()) return;
    try {
      const updated = await api.addMemberToSalon(selectedSalon.communityId, selectedSalon.id, addMemberInput.trim());
      setSelectedSalon(updated);
      const list = await api.getSalons(selectedSalon.communityId);
      setSalonsMap((prev) => ({ ...prev, [selectedSalon.communityId]: list }));
      setAddMemberInput("");
      toast.success(`@${addMemberInput.trim()} a été ajouté avec succès au salon !`);
    } catch (err: any) {
      toast.error(err.message || "Impossible d'ajouter le membre");
    }
  };

  const handleSendJoinRequest = async (salon: SalonItem) => {
    try {
      await api.requestJoinSalon(salon.communityId, salon.id);
      setRequestJoinSalonPrompt(null);
      toast.success("Votre demande d'adhésion a été transmise aux administrateurs du salon !");
      const list = await api.getSalons(salon.communityId);
      setSalonsMap((prev) => ({ ...prev, [salon.communityId]: list }));
    } catch (err: any) {
      toast.error(err.message || "Erreur de demande d'accès");
    }
  };

  const handleRespondSalonJoin = async (targetUsername: string, approve: boolean) => {
    if (!selectedSalon) return;
    try {
      const updated = await api.respondSalonJoinRequest(
        selectedSalon.communityId,
        selectedSalon.id,
        targetUsername,
        approve
      );
      setSelectedSalon(updated);
      const list = await api.getSalons(selectedSalon.communityId);
      setSalonsMap((prev) => ({ ...prev, [selectedSalon.communityId]: list }));
    } catch (err: any) {
      toast.error(err.message || "Erreur lors du traitement de la demande");
    }
  };

  const handleDeleteSalon = async (salonId: string) => {
    if (!selectedSalon) return;
    if (!confirm("Êtes-vous sûr de vouloir supprimer définitivement ce salon ?")) return;

    try {
      await api.deleteSalon(selectedSalon.communityId, salonId);
      const list = await api.getSalons(selectedSalon.communityId);
      setSalonsMap((prev) => ({ ...prev, [selectedSalon.communityId]: list }));
      if (activePartner === salonId) {
        setActivePartner("general");
      }
      setSalonSettingsOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Impossible de supprimer le salon");
    }
  };

  return (
    <div className="chat-shell mx-auto flex h-app w-full max-w-7xl flex-col gap-3 sm:px-6 sm:py-4 lg:px-8">
      {/* Ticker */}
      <div className="hidden lg:block">
        <KivaEventTicker />
      </div>

      {/* Pending Community Invitations Banner */}
      {myPendingInvites.length > 0 && (
        <div className="space-y-2 px-2 pt-2 sm:px-0 sm:pt-0">
          {myPendingInvites.map((invComm) => (
            <div
              key={invComm.id}
              className="p-3 rounded-2xl bg-gradient-to-r from-amber-500/15 to-indigo-500/15 border border-amber-500/30 flex items-center justify-between gap-3 shadow-lg"
            >
              <div className="flex items-center gap-2.5">
                <Bell className="h-5 w-5 text-amber-400 shrink-0 animate-bounce" />
                <div className="text-xs sm:text-sm">
                  <span className="font-bold text-white">Invitation communautaire : </span>
                  <span className="text-slate-300">
                    Vous êtes invité à rejoindre la communauté{" "}
                    <strong className="text-indigo-300">{invComm.name}</strong> !
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  onClick={() => handleRespondCommInvite(invComm.id, true)}
                  className="h-7 px-2.5 text-xs gap-1 bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  <Check className="h-3.5 w-3.5" />
                  Accepter
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleRespondCommInvite(invComm.id, false)}
                  className="h-7 px-2 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                >
                  <X className="h-3.5 w-3.5" />
                  Refuser
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 sm:gap-5 lg:grid-cols-12">
        {/* Left Sidebar */}
        <Card
          className={`lg:col-span-4 p-0 flex min-h-0 flex-col overflow-hidden rounded-none border-x-0 border-y-0 sm:rounded-2xl sm:border border-slate-800/90 shadow-2xl bg-slate-900/80 backdrop-blur-xl ${
            mobileView === "chat" ? "hidden lg:flex" : "flex"
          }`}
        >
          {/* Header */}
          <div className="p-3 sm:p-4 border-b border-slate-800/80 bg-slate-900/70 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-base font-bold text-white flex items-center gap-2">
                  <MessageSquare className="hidden sm:block h-4 w-4 text-indigo-400" />
                  Discussions
                </h2>
              </div>
              <Badge variant={connected ? "live" : "secondary"} className="hidden sm:inline-flex">
                {connected ? "KivaDB WS" : "Hors-ligne"}
              </Badge>
            </div>

            {/* Community Switcher */}
            <div className="flex items-center gap-1.5 bg-slate-950/60 p-1.5 rounded-xl border border-slate-800/80">
              <div className="flex-1 min-w-0">
                <select
                  value={selectedCommunityId}
                  onChange={(e) => setSelectedCommunityId(e.target.value)}
                  className="w-full bg-transparent text-xs font-semibold text-white border-none focus:outline-none focus:ring-0 cursor-pointer truncate"
                >
                  {communities.map((comm) => (
                    <option key={comm.id} value={comm.id} className="bg-slate-900 text-white">
                      {comm.name} {comm.isPrivate ? "🔒 (Privée)" : "🌐 (Publique)"}
                    </option>
                  ))}
                </select>
              </div>

              {isCommAdmin && currentComm && (
                <button
                  onClick={() => {
                    setSelectedComm(currentComm);
                    setCommunitySettingsOpen(true);
                  }}
                  className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
                  title="Gérer la communauté"
                >
                  <Settings className="h-3.5 w-3.5" />
                </button>
              )}

              <Button
                size="sm"
                variant="ghost"
                onClick={() => setCreateCommunityOpen(true)}
                className="h-6 px-1.5 text-[11px] gap-1 text-indigo-400 hover:text-white hover:bg-indigo-600/20 rounded-lg shrink-0"
                title="Créer une communauté"
              >
                <Plus className="h-3 w-3" />
                <span className="hidden sm:inline">Créer</span>
              </Button>
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
          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/50 p-2 space-y-3">
            {/* Salons in active Community */}
            <div>
              <div className="flex items-center justify-between px-2 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <span className="flex items-center gap-1.5 truncate">
                  <Hash className="h-3.5 w-3.5 text-indigo-400" />
                  Salons de {currentComm?.name || "la communauté"} ({currentSalons.length})
                </span>
                {isCommAdmin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCreateSalonOpen(true)}
                    className="h-6 px-2 text-[10px] gap-1 text-indigo-400 hover:text-white hover:bg-indigo-600/20 rounded-md shrink-0"
                  >
                    <Plus className="h-3 w-3" />
                    Salon
                  </Button>
                )}
              </div>

              <div className="space-y-1 mt-1">
                {currentSalons
                  .filter(
                    (s) =>
                      s.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
                      s.id.toLowerCase().includes(searchFilter.toLowerCase())
                  )
                  .map((salon) => {
                    const isActive =
                      activePartner === salon.id ||
                      (activePartner === "general" && salon.id === "general");

                    const isMemberOfSalon =
                      user &&
                      Array.isArray(salon.members) &&
                      salon.members.map((m) => m.toLowerCase()).includes(user.username.toLowerCase());

                    const hasRequested =
                      user &&
                      Array.isArray(salon.joinRequests) &&
                      salon.joinRequests.map((r) => r.toLowerCase()).includes(user.username.toLowerCase());

                    return (
                      <div
                        key={salon.id}
                        className={`w-full flex items-center justify-between p-2 rounded-xl transition-all cursor-pointer ${
                          isActive
                            ? "bg-indigo-600/20 border border-indigo-500/30 text-white"
                            : "hover:bg-slate-800/50 text-slate-300"
                        }`}
                        onClick={() => handleSelectSalon(salon)}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div
                            className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${
                              salon.visibility === "hidden_private"
                                ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                                : salon.visibility === "visible_private"
                                ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                : "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                            }`}
                          >
                            {salon.visibility === "hidden_private" ? (
                              <EyeOff className="h-3.5 w-3.5" />
                            ) : salon.visibility === "visible_private" ? (
                              <Lock className="h-3.5 w-3.5" />
                            ) : (
                              <Hash className="h-3.5 w-3.5" />
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-xs sm:text-sm text-white truncate">
                                {salon.name}
                              </span>
                              {salon.visibility === "visible_private" && (
                                <Badge variant="warning" className="text-[9px] px-1 py-0 h-4">
                                  Privé
                                </Badge>
                              )}
                              {salon.visibility === "hidden_private" && (
                                <Badge variant="destructive" className="text-[9px] px-1 py-0 h-4 bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                  Masqué
                                </Badge>
                              )}
                              {salon.visibility === "visible_private" && !isMemberOfSalon && (
                                <span className="text-[9px] text-amber-400 font-medium">
                                  {hasRequested ? "(Demande envoyée)" : "(Demander l'accès)"}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400 truncate">
                              {salon.description || "Salon de discussion"}
                            </p>
                          </div>
                        </div>

                        {/* Admin settings */}
                        {isCommAdmin && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedSalon(salon);
                              setSalonSettingsOpen(true);
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

            {/* Direct Messages Section with Unread Counter Badges */}
            <div className="pt-2">
              <div className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-indigo-400" />
                Messages privés (Directs 1-à-1)
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
                  .sort((a, b) => {
                    const ca = conversations.find((c) => c.withUser === a.username)?.lastTimestamp || 0;
                    const cb = conversations.find((c) => c.withUser === b.username)?.lastTimestamp || 0;
                    if (ca !== cb) return cb - ca;
                    return Number(isOnline(b.username)) - Number(isOnline(a.username));
                  })
                  .map((item) => {
                    const isActive = activePartner === item.username;
                    const convo = conversations.find((c) => c.withUser === item.username);
                    const unreadCount = convo?.unreadCount || 0;

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
                        <div className="relative shrink-0">
                          <Avatar src={item.avatar} fallback={item.username} size="md" online={isOnline(item.username)} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-xs sm:text-sm text-white truncate">
                              {item.displayName || item.username}
                            </span>
                            <div className="flex items-center gap-1.5">
                              {convo && (
                                <span className="text-[10px] text-slate-400 font-mono">
                                  {formatTime(convo.lastTimestamp)}
                                </span>
                              )}
                              {unreadCount > 0 && (
                                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-rose-500 text-white shadow-sm shadow-rose-500/40">
                                  {unreadCount}
                                </span>
                              )}
                            </div>
                          </div>
                          <p className={`text-[11px] truncate ${unreadCount > 0 ? "text-indigo-300 font-medium" : "text-slate-400"}`}>
                            {typingUsers[item.username] && activePartner === item.username
                              ? "écrit…"
                              : convo
                              ? convo.lastMessage
                              : isOnline(item.username)
                              ? "En ligne"
                              : `@${item.username}`}
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
          className={`lg:col-span-8 p-0 flex min-h-0 flex-col overflow-hidden rounded-none border-x-0 border-y-0 sm:rounded-2xl sm:border border-slate-800/90 shadow-2xl bg-slate-900/80 backdrop-blur-xl relative ${
            mobileView === "contacts" ? "hidden lg:flex" : "flex"
          }`}
        >
          {/* Header */}
          <div className="chat-top px-2 py-2.5 sm:p-4 border-b border-slate-800/80 bg-slate-900/90 backdrop-blur-xl flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
              {/* Mobile Back Button */}
              <button
                onClick={() => setMobileView("contacts")}
                className="lg:hidden flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-200 hover:bg-slate-800 active:bg-slate-800 transition-colors"
                title="Retour aux salons"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>

              {isSalon ? (
                <>
                  <div
                    className={`h-9 w-9 sm:h-10 sm:w-10 rounded-xl flex items-center justify-center shrink-0 ${
                      activeSalon?.visibility === "hidden_private"
                        ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                        : activeSalon?.visibility === "visible_private"
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                        : "bg-gradient-to-tr from-indigo-500 to-purple-600 text-white"
                    }`}
                  >
                    {activeSalon?.visibility === "hidden_private" ? (
                      <EyeOff className="h-5 w-5" />
                    ) : activeSalon?.visibility === "visible_private" ? (
                      <Lock className="h-5 w-5" />
                    ) : (
                      <Hash className="h-5 w-5" />
                    )}
                  </div>
                  <div className="truncate">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-white text-sm sm:text-base truncate">
                        {activeSalon?.name}
                      </h3>
                      <Badge variant="outline" className="hidden sm:inline-flex text-[10px] px-1.5 py-0 border-indigo-500/40 text-indigo-300">
                        {currentComm?.name}
                      </Badge>
                      {activeSalon?.visibility === "visible_private" && (
                        <Badge variant="warning" className="text-[9px] px-1.5 py-0">
                          Salon Privé
                        </Badge>
                      )}
                      {activeSalon?.visibility === "hidden_private" && (
                        <Badge variant="destructive" className="text-[9px] px-1.5 py-0 bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          Salon Masqué
                        </Badge>
                      )}
                    </div>
                    <p className={cn("text-[11px] sm:text-xs truncate", typingLabel ? "text-indigo-300" : "text-slate-400")}>
                      {typingLabel ? `${typingLabel}…` : activeSalon?.description || "Salon communautaire KivaDB"}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <Link href={`/profile/${activePartner}`} className="shrink-0">
                    <Avatar
                      src={currentDirectUser?.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${activePartner}`}
                      fallback={activePartner}
                      size="md"
                      online={isOnline(activePartner)}
                    />
                  </Link>
                  <div className="truncate">
                    <div className="flex items-center gap-1.5">
                      <Link
                        href={`/profile/${activePartner}`}
                        className="font-bold text-white text-sm sm:text-base truncate hover:underline hover:text-indigo-300 transition-colors"
                      >
                        {currentDirectUser?.displayName || activePartner}
                      </Link>
                      <span className="hidden xs:inline text-xs text-indigo-400 font-mono">@{activePartner}</span>
                    </div>
                    <p className={cn("text-[11px] sm:text-xs flex items-center gap-1 truncate", typingLabel ? "text-indigo-300" : isOnline(activePartner) ? "text-emerald-400" : "text-slate-400")}>
                      {typingLabel ? (
                        <>{typingLabel}…</>
                      ) : (
                        <>
                          <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", isOnline(activePartner) ? "bg-emerald-400" : "bg-slate-500")} />
                          {lastSeenLabel(isOnline(activePartner), lastSeen[activePartner])}
                        </>
                      )}
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              {isSalonAdmin && activeSalon && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedSalon(activeSalon);
                    setSalonSettingsOpen(true);
                  }}
                  className="h-8 px-2.5 text-xs gap-1.5 border-slate-700"
                >
                  <Settings className="h-3.5 w-3.5 text-indigo-400" />
                  <span className="hidden sm:inline">Gérer le salon</span>
                </Button>
              )}
              <Badge variant="outline" className="hidden sm:inline-flex font-mono text-[10px] sm:text-xs shrink-0">
                {messages.length} msg
              </Badge>
            </div>
          </div>

          {/* Messages Feed */}
          <div ref={scrollBoxRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-2.5 py-3 sm:p-4 bg-slate-950/50" onClick={(e) => { if (e.target === e.currentTarget) setActionMsgId(null); }}>
            {hasMoreHistory && (
              <div className="flex justify-center">
                <button
                  onClick={loadOlderMessages}
                  disabled={loadingHistory}
                  className="flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900/80 px-3 py-1.5 text-xs text-slate-300 hover:text-white disabled:opacity-60"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                  {loadingHistory ? "Chargement…" : "Messages précédents"}
                </button>
              </div>
            )}
            {messagesLoading ? (
              <div className="space-y-4">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className={cn("flex", i % 2 ? "justify-end" : "justify-start")}>
                    <div className={cn("skeleton h-12 rounded-2xl", i % 2 ? "w-1/2" : "w-2/3")} />
                  </div>
                ))}
              </div>
            ) : messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-2 p-4 text-center">
                <MessageSquare className="h-9 w-9 sm:h-11 sm:w-11 text-slate-600 mb-1" />
                <p className="font-bold text-white text-sm sm:text-base">Aucun message pour l&apos;instant</p>
                <p className="text-xs text-slate-400 max-w-sm">
                  {isSalon
                    ? `Partagez le premier message dans ${activeSalon?.name || "ce salon"} ! Tapez @ pour mentionner un membre.`
                    : `Commencez votre conversation privée avec ${currentDirectUser?.displayName || activePartner}.`}
                </p>
              </div>
            ) : (
              messages.map((m, index) => {
                const isSentByMe = m.from === user?.username;
                const isMentioned = user && Array.isArray(m.mentions) && m.mentions.includes(user.username);
                const displayName = m.fromDisplayName || m.from;
                const prev = messages[index - 1];
                const next = messages[index + 1];
                const showDay = !prev || new Date(prev.timestamp).toDateString() !== new Date(m.timestamp).toDateString();
                // Regroupement : même auteur, même jour, moins de 5 min d'écart
                const sameGroup = (a?: ChatMessage, b?: ChatMessage) =>
                  !!a && !!b && a.from === b.from && b.timestamp - a.timestamp < 5 * 60 * 1000 &&
                  new Date(a.timestamp).toDateString() === new Date(b.timestamp).toDateString();
                const isFirstInGroup = !sameGroup(prev, m);
                const isLastInGroup = !sameGroup(m, next);
                const showName = isSalon && !isSentByMe && isFirstInGroup;
                const actionsOpen = actionMsgId === m.id;

                return (
                  <div key={m.id} className={isFirstInGroup ? "mt-3 first:mt-0" : "mt-0.5"}>
                  {showDay && (
                    <div className="mb-3 mt-1 flex justify-center">
                      <span className="rounded-full bg-slate-800/80 px-3 py-1 text-[11px] font-semibold text-slate-300 shadow-sm">
                        {dayLabel(m.timestamp)}
                      </span>
                    </div>
                  )}
                  <div
                    className={`group flex items-end gap-1.5 sm:gap-2.5 ${
                      isSentByMe ? "justify-end" : "justify-start"
                    }`}
                  >
                    {isSentByMe && !m.deleted && (
                      <button
                        onClick={() => {
                          setActionMsgId(null);
                          handleDeleteMessage(m);
                        }}
                        className={cn(
                          "mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition-opacity hover:bg-rose-500/10 hover:text-rose-400",
                          actionsOpen ? "opacity-100 bg-slate-800" : "pointer-events-none opacity-0 sm:pointer-events-auto sm:group-hover:opacity-100"
                        )}
                        aria-label="Supprimer le message"
                        title="Supprimer pour tout le monde"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {!isSentByMe &&
                      (isLastInGroup ? (
                        <Link
                          href={`/profile/${m.from}`}
                          className="shrink-0 transition-transform hover:scale-105"
                          title={`Voir le profil de ${displayName}`}
                        >
                          <Avatar
                            src={m.fromAvatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${m.from}`}
                            fallback={m.from}
                            size="sm"
                          />
                        </Link>
                      ) : (
                        <span className="w-8 shrink-0" aria-hidden />
                      ))}

                    <div
                      onClick={() => isSentByMe && !m.deleted && setActionMsgId(actionsOpen ? null : m.id)}
                      className={cn(
                        "max-w-[80%] sm:max-w-[70%] min-w-0 rounded-[20px] px-3.5 py-2 sm:px-4 sm:py-2.5 text-[15px] sm:text-sm leading-snug shadow-sm transition-all",
                        isSentByMe
                          ? "bg-gradient-to-br from-indigo-600 to-violet-600 text-white"
                          : isMentioned
                          ? "bg-slate-900 border-2 border-amber-500/80 text-slate-100"
                          : "bg-slate-800 text-slate-100",
                        isSentByMe ? (isLastInGroup ? "rounded-br-md" : "rounded-br-md rounded-tr-md") : isLastInGroup ? "rounded-bl-md" : "rounded-bl-md rounded-tl-md",
                        isSentByMe && !isFirstInGroup && "rounded-tr-md",
                        !isSentByMe && !isFirstInGroup && "rounded-tl-md",
                        actionsOpen && "ring-2 ring-indigo-400/60"
                      )}
                    >
                      {/* Nom de l'auteur : seulement en salon, en tête de groupe */}
                      {(showName || (isMentioned && !isSentByMe)) && (
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <Link
                          href={`/profile/${m.from}`}
                          className="flex items-center gap-1.5 flex-wrap group transition-colors"
                          title={`Accéder au profil de @${m.from}`}
                        >
                          <span
                            className={`font-bold text-[13px] sm:text-sm group-hover:underline ${
                              isSentByMe
                                ? "text-indigo-100 group-hover:text-white"
                                : "text-indigo-300 group-hover:text-indigo-200"
                            }`}
                          >
                            {displayName}
                          </span>
                          {!isSentByMe && (
                            <span className="hidden sm:inline text-[10px] text-slate-400 font-mono group-hover:text-slate-300">
                              @{m.from}
                            </span>
                          )}
                        </Link>
                        {isMentioned && !isSentByMe && (
                          <Badge variant="warning" className="text-[9px] px-1.5 py-0 h-4">
                            @Vous
                          </Badge>
                        )}
                      </div>
                      )}

                      {m.deleted && (
                        <p className="italic text-xs sm:text-sm opacity-70">🚫 Ce message a été supprimé</p>
                      )}

                      {/* Text Content */}
                      {m.content && (
                        <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                          {renderMessageContent(m.content, isSentByMe)}
                        </p>
                      )}

                      {/* Media Attachments: Photos, Videos, Voice, Documents */}
                      {m.attachments && m.attachments.length > 0 && (
                        <div className="space-y-2 my-1.5">
                          {m.attachments.map((att, idx) => {
                            const fullUrl = att.url.startsWith("http") ? att.url : `${getBackendUrl()}${att.url}`;

                            if (att.type === "image") {
                              return (
                                <div key={idx} className="relative group max-w-full sm:max-w-sm rounded-xl overflow-hidden border border-white/10 shadow-lg">
                                  <img
                                    src={fullUrl}
                                    alt={att.name}
                                    className="max-h-64 sm:max-h-72 w-auto max-w-full object-cover rounded-xl"
                                  />
                                  <a
                                    href={fullUrl}
                                    download={att.name}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="absolute bottom-2 right-2 p-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-white backdrop-blur-md sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex items-center gap-1 text-[10px]"
                                  >
                                    <Download className="h-3 w-3" />
                                    Télécharger
                                  </a>
                                </div>
                              );
                            }

                            if (att.type === "video") {
                              return (
                                <div key={idx} className="max-w-full sm:max-w-sm rounded-xl overflow-hidden border border-white/10 space-y-1 shadow-lg">
                                  <video
                                    src={fullUrl}
                                    controls
                                    preload="metadata"
                                    className="max-h-64 sm:max-h-72 w-full rounded-xl bg-black/50"
                                  />
                                  <div className="flex justify-end pr-1 pb-1">
                                    <a
                                      href={fullUrl}
                                      download={att.name}
                                      className="text-[10px] text-indigo-300 hover:text-white flex items-center gap-1"
                                    >
                                      <Download className="h-3 w-3" />
                                      Télécharger la vidéo
                                    </a>
                                  </div>
                                </div>
                              );
                            }

                            if (att.type === "audio") {
                              return (
                                <VoiceMessagePlayer
                                  key={idx}
                                  url={att.url}
                                  duration={att.duration}
                                  isSentByMe={isSentByMe}
                                />
                              );
                            }

                            // Document attachment
                            return (
                              <a
                                key={idx}
                                href={fullUrl}
                                download={att.name}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2.5 p-2 rounded-xl bg-black/25 hover:bg-black/40 border border-white/10 transition-colors group"
                              >
                                <div className="h-8 w-8 rounded-lg bg-indigo-500/20 text-indigo-300 flex items-center justify-center shrink-0">
                                  <FileText className="h-4 w-4" />
                                </div>
                                <div className="flex-1 min-w-0 text-left">
                                  <p className="text-xs font-semibold text-white truncate group-hover:underline">
                                    {att.name}
                                  </p>
                                  <p className="text-[10px] text-slate-400">
                                    {att.size ? `${(att.size / 1024 / 1024).toFixed(1)} Mo` : "Document"}
                                  </p>
                                </div>
                                <Download className="h-4 w-4 text-slate-400 group-hover:text-white shrink-0" />
                              </a>
                            );
                          })}
                        </div>
                      )}

                      {/* Footer: Timestamp & WhatsApp Read Receipts (Single gray tick vs Double blue ticks!) */}
                      <div className="flex items-center justify-end gap-1.5 mt-1 text-[9px] sm:text-[10px] text-slate-300/80 font-mono">
                        <span>{formatTime(m.timestamp)}</span>
                        {isSentByMe && (
                          <span
                            className="flex items-center ml-0.5"
                            title={m.read ? "Lu (vu)" : "Envoyé (non lu)"}
                          >
                            {m.read ? (
                              <CheckCheck className="h-3.5 w-3.5 text-sky-400 font-bold" />
                            ) : (
                              <Check className="h-3.5 w-3.5 text-slate-400" />
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  </div>
                );
              })
            )}
            {typingLabel && (
              <div className="flex items-center gap-2 pl-1 text-xs text-slate-400 animate-fade-up">
                <span className="flex items-center gap-1 rounded-2xl rounded-bl-none bg-slate-800/90 px-3 py-2.5">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="h-1.5 w-1.5 rounded-full bg-slate-300 animate-typing-dot" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </span>
                {typingLabel}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Pending Attachments Preview Chips */}
          {pendingAttachments.length > 0 && (
            <div className="px-3 py-2 bg-slate-900 border-t border-slate-800 flex items-center gap-2 overflow-x-auto">
              {pendingAttachments.map((att, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 text-xs text-white border border-slate-700 shrink-0"
                >
                  {att.type === "image" ? (
                    <ImageIcon className="h-3.5 w-3.5 text-indigo-400" />
                  ) : att.type === "video" ? (
                    <Film className="h-3.5 w-3.5 text-purple-400" />
                  ) : (
                    <FileText className="h-3.5 w-3.5 text-emerald-400" />
                  )}
                  <span className="max-w-[120px] truncate">{att.name}</span>
                  <button
                    type="button"
                    onClick={() => removePendingAttachment(idx)}
                    className="p-0.5 hover:text-rose-400 transition-colors ml-1"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* @ Mention Suggestions Popup (SALONS ONLY!) */}
          {isSalon && mentionQuery !== null && mentionSuggestions.length > 0 && (
            <div className="absolute bottom-16 left-3 right-3 sm:left-4 sm:right-auto sm:w-80 max-h-48 overflow-y-auto rounded-xl bg-slate-900/95 border border-indigo-500/40 shadow-2xl backdrop-blur-xl p-1 z-30 divide-y divide-slate-800/60">
              <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <AtSign className="h-3 w-3 text-indigo-400" />
                Mentionner un utilisateur dans le salon
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

          {/* Hidden File Input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
            multiple
            accept="image/*,video/*,.pdf,.doc,.docx,.txt"
          />

          {/* Input Footer: Voice Recording Bar OR Normal Input */}
          {isRecording ? (
            <div className="p-2.5 sm:p-3 pb-[calc(0.625rem+var(--safe-bottom))] sm:pb-3 border-t border-slate-800/80 bg-slate-900/90 flex items-center justify-between gap-3 animate-fade-up">
              <div className="flex items-center gap-2.5">
                <span className="h-3 w-3 rounded-full bg-rose-500 animate-ping" />
                <span className="text-xs font-bold text-rose-400 font-mono">
                  Enregistrement vocal : {Math.floor(recordingSeconds / 60)}:
                  {recordingSeconds % 60 < 10 ? "0" : ""}
                  {recordingSeconds % 60}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={cancelRecording}
                  className="text-xs text-slate-400 hover:text-rose-400 gap-1 h-8 px-2.5"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Annuler
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={stopAndSendRecording}
                  isLoading={sending}
                  className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white gap-1 h-8 px-3"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span className="hidden xs:inline">Envoyer le vocal</span>
                  <span className="xs:hidden">Envoyer</span>
                </Button>
              </div>
            </div>
          ) : (
            <form
              onSubmit={handleSend}
              className="p-2 sm:p-3 pb-[calc(0.5rem+var(--safe-bottom))] sm:pb-3 border-t border-slate-800/80 bg-slate-900/80 flex items-center gap-1 sm:gap-2"
            >
              {/* Attachment Picker Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAttachment}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
                title="Joindre une photo, vidéo ou document"
              >
                <Paperclip className="h-4 w-4 sm:h-5 sm:w-5" />
              </button>

              {/* Text Input */}
              <div className="relative flex-1">
                <Input
                  ref={inputRef}
                  type="text"
                  placeholder={
                    isSalon
                      ? `Écrire dans #${activeSalon?.name}... Tapez @ pour mentionner`
                      : `Écrire à ${currentDirectUser?.displayName || activePartner}...`
                  }
                  value={inputContent}
                  onChange={handleInputChange}
                  onBlur={() => emitTyping(false)}
                  maxLength={4000}
                  enterKeyHint="send"
                  className={`w-full rounded-full bg-slate-950/90 text-sm h-11 sm:h-10 border-slate-700/80 ${
                    isSalon ? "pr-9" : "pr-3"
                  }`}
                />
                {/* @ Mention button: VISIBLE ONLY IN SALONS! */}
                {isSalon && (
                  <button
                    type="button"
                    onClick={() => {
                      setInputContent((prev) => prev + "@");
                      setMentionQuery("");
                      setMentionStartIndex(inputContent.length);
                      inputRef.current?.focus();
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-300"
                    title="Mentionner avec @"
                  >
                    <AtSign className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Voice Message Mic Button */}
              <button
                type="button"
                onClick={startRecording}
                className="p-2 rounded-xl text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition-colors shrink-0"
                title="Enregistrer un message vocal"
              >
                <Mic className="h-4 w-4 sm:h-5 sm:w-5" />
              </button>

              {/* Send Button */}
              <Button
                type="submit"
                size="default"
                disabled={!inputContent.trim() && pendingAttachments.length === 0}
                className="gap-1.5 sm:gap-2 shrink-0 h-11 w-11 sm:h-10 sm:w-auto rounded-full sm:rounded-lg px-0 sm:px-4 text-xs sm:text-sm shadow-md shadow-indigo-500/20"
                isLoading={sending}
              >
                <Send className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Envoyer</span>
              </Button>
            </form>
          )}
        </Card>
      </div>

      {/* Modal: Join Request for visible_private salon */}
      {requestJoinSalonPrompt && (
        <Dialog
          open={!!requestJoinSalonPrompt}
          onOpenChange={() => setRequestJoinSalonPrompt(null)}
          title={`Accès au salon : ${requestJoinSalonPrompt.name}`}
          description="Ce salon est privé. Vous devez demander l'adhésion pour pouvoir y accéder et participer."
        >
          <div className="space-y-4">
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3">
              <Lock className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-slate-300">
                <p className="font-semibold text-white mb-1">Salon Privé sur approbation</p>
                <p>{requestJoinSalonPrompt.description || "Aucune description fournie."}</p>
                <p className="mt-2 text-slate-400">
                  Créé par : <strong className="text-white">@{requestJoinSalonPrompt.creator}</strong>
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRequestJoinSalonPrompt(null)}
              >
                Annuler
              </Button>
              <Button
                type="button"
                onClick={() => handleSendJoinRequest(requestJoinSalonPrompt)}
                className="gap-2 bg-amber-600 hover:bg-amber-500 text-white"
              >
                <UserPlus className="h-4 w-4" />
                Demander à adhérer
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Modal: Créer une Communauté */}
      <Dialog
        open={createCommunityOpen}
        onOpenChange={setCreateCommunityOpen}
        title="Créer une nouvelle Communauté"
        description="Créez votre propre communauté, personnalisez sa visibilité et invitez des membres."
      >
        <form onSubmit={handleCreateCommunitySubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Nom de la communauté *
            </label>
            <Input
              type="text"
              placeholder="ex: Développeurs TypeScript, Guilde Gaming..."
              value={newCommName}
              onChange={(e) => setNewCommName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Description (Optionnel)
            </label>
            <Input
              type="text"
              placeholder="ex: Communauté d'entraide et de partage technique"
              value={newCommDesc}
              onChange={(e) => setNewCommDesc(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/40 border border-slate-700/60">
            <input
              type="checkbox"
              id="isPrivateCommCheck"
              checked={newCommPrivate}
              onChange={(e) => setNewCommPrivate(e.target.checked)}
              className="h-4 w-4 rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 bg-slate-900"
            />
            <label htmlFor="isPrivateCommCheck" className="text-xs text-slate-300 cursor-pointer">
              <span className="font-bold text-white block">Communauté Privée & Masquée</span>
              Seules les personnes invitées pourront voir et rejoindre cette communauté.
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateCommunityOpen(false)}
            >
              Annuler
            </Button>
            <Button type="submit" isLoading={creatingComm} className="gap-2">
              <Plus className="h-4 w-4" />
              Créer la communauté
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Modal: Gérer la Communauté */}
      {selectedComm && (
        <Dialog
          open={communitySettingsOpen}
          onOpenChange={setCommunitySettingsOpen}
          title={`Paramètres : ${selectedComm.name}`}
          description={`Créée par @${selectedComm.creator}. Gérez les membres, administrateurs et invitations.`}
        >
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            {/* Info */}
            <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Créateur :</span>
                <span className="font-semibold text-white font-mono flex items-center gap-1">
                  <Crown className="h-3 w-3 text-amber-400" />
                  @{selectedComm.creator}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Visibilité :</span>
                <Badge variant={selectedComm.isPrivate ? "warning" : "default"}>
                  {selectedComm.isPrivate ? "Privée" : "Publique"}
                </Badge>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Total membres :</span>
                <span className="text-white font-bold">{selectedComm.members?.length || 1}</span>
              </div>
            </div>

            {/* Inviter un utilisateur */}
            <div className="p-3 rounded-xl bg-indigo-950/30 border border-indigo-500/30 space-y-2">
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <UserPlus className="h-4 w-4 text-indigo-400" />
                Inviter un nouvel utilisateur dans la communauté
              </h4>
              <p className="text-[11px] text-slate-400">
                L&apos;utilisateur recevra une invitation qu&apos;il devra accepter pour entrer.
              </p>
              <div className="flex gap-2">
                <select
                  value={inviteUsernameInput}
                  onChange={(e) => setInviteUsernameInput(e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg text-xs px-2.5 py-1.5 text-white"
                >
                  <option value="">Sélectionner un utilisateur...</option>
                  {users
                    .filter((u) => !selectedComm.members?.map((m) => m.toLowerCase()).includes(u.username.toLowerCase()))
                    .map((u) => (
                      <option key={u.username} value={u.username}>
                        {u.displayName} (@{u.username})
                      </option>
                    ))}
                </select>
                <Button size="sm" onClick={handleInviteUserToComm} disabled={!inviteUsernameInput}>
                  Inviter
                </Button>
              </div>
            </div>

            {/* Liste des membres */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Membres de la communauté ({selectedComm.members?.length || 0})
              </h4>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {selectedComm.members?.map((mem) => {
                  const isMemAdmin = (selectedComm.admins || []).map((a) => a.toLowerCase()).includes(mem.toLowerCase());
                  const isMemCreator = selectedComm.creator.toLowerCase() === mem.toLowerCase();

                  return (
                    <div
                      key={mem}
                      className="flex items-center justify-between p-2 rounded-lg bg-slate-800/40 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <Avatar src={`https://api.dicebear.com/7.x/bottts/svg?seed=${mem}`} fallback={mem} size="sm" />
                        <div>
                          <span className="font-semibold text-white">@{mem}</span>
                          {isMemCreator && (
                            <Badge variant="warning" className="ml-1.5 text-[9px] px-1 py-0">
                              Créateur
                            </Badge>
                          )}
                          {isMemAdmin && !isMemCreator && (
                            <Badge variant="default" className="ml-1.5 text-[9px] px-1 py-0">
                              Admin
                            </Badge>
                          )}
                        </div>
                      </div>

                      {isCommCreator && !isMemCreator && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleToggleAdmin(mem)}
                          className="h-6 text-[10px] text-indigo-400 hover:text-white"
                        >
                          {isMemAdmin ? "Retirer Admin" : "Nommer Admin"}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Supprimer la communauté */}
            {isCommCreator && selectedComm.id !== "comm-general" && (
              <div className="pt-2 border-t border-slate-800">
                <Button
                  variant="destructive"
                  className="w-full gap-2 text-xs"
                  onClick={() => handleDeleteCommunity(selectedComm.id)}
                >
                  <Trash2 className="h-4 w-4" />
                  Supprimer définitivement la communauté
                </Button>
              </div>
            )}
          </div>
        </Dialog>
      )}

      {/* Modal: Créer un Salon */}
      <Dialog
        open={createSalonOpen}
        onOpenChange={setCreateSalonOpen}
        title="Créer un nouveau salon"
        description={`Ajoutez un salon dans la communauté ${currentComm?.name}. Les membres actuels y auront accès.`}
      >
        <form onSubmit={handleCreateSalonSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Nom du salon *
            </label>
            <Input
              type="text"
              placeholder="ex: Annonces, Général, Salle-VIP..."
              value={newSalonName}
              onChange={(e) => setNewSalonName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Description (Optionnel)
            </label>
            <Input
              type="text"
              placeholder="ex: Échanges et discussions générales"
              value={newSalonDesc}
              onChange={(e) => setNewSalonDesc(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Visibilité et Accès du Salon
            </label>
            <div className="space-y-2 text-xs">
              <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-800/40 border border-slate-700/60 cursor-pointer">
                <input
                  type="radio"
                  name="salonVis"
                  value="public"
                  checked={newSalonVisibility === "public"}
                  onChange={() => setNewSalonVisibility("public")}
                  className="mt-0.5 text-indigo-600"
                />
                <div>
                  <span className="font-bold text-white block">Public dans la communauté</span>
                  <span className="text-slate-400 text-[11px]">
                    Tous les membres actuels de la communauté y sont ajoutés automatiquement.
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-800/40 border border-slate-700/60 cursor-pointer">
                <input
                  type="radio"
                  name="salonVis"
                  value="visible_private"
                  checked={newSalonVisibility === "visible_private"}
                  onChange={() => setNewSalonVisibility("visible_private")}
                  className="mt-0.5 text-amber-500"
                />
                <div>
                  <span className="font-bold text-white block">Privé & Visible</span>
                  <span className="text-slate-400 text-[11px]">
                    Visible dans la liste par les membres. Ceux qui n&apos;y sont pas doivent cliquer pour demander d&apos;adhérer.
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-800/40 border border-slate-700/60 cursor-pointer">
                <input
                  type="radio"
                  name="salonVis"
                  value="hidden_private"
                  checked={newSalonVisibility === "hidden_private"}
                  onChange={() => setNewSalonVisibility("hidden_private")}
                  className="mt-0.5 text-purple-500"
                />
                <div>
                  <span className="font-bold text-white block">Privé & Masqué</span>
                  <span className="text-slate-400 text-[11px]">
                    Totalement invisible pour les personnes non membres. Seul un administrateur peut y ajouter des membres.
                  </span>
                </div>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateSalonOpen(false)}
            >
              Annuler
            </Button>
            <Button type="submit" isLoading={creatingSalon} className="gap-2">
              <Plus className="h-4 w-4" />
              Créer le salon
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Modal: Gérer le Salon */}
      {selectedSalon && (
        <Dialog
          open={salonSettingsOpen}
          onOpenChange={setSalonSettingsOpen}
          title={`Paramètres du salon : #${selectedSalon.name}`}
          description="Gérez les membres, les demandes d'adhésion et la visibilité."
        >
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            {/* Info */}
            <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Créateur du salon :</span>
                <span className="font-semibold text-white font-mono">@{selectedSalon.creator}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Visibilité :</span>
                <Badge
                  variant={
                    selectedSalon.visibility === "hidden_private"
                      ? "destructive"
                      : selectedSalon.visibility === "visible_private"
                      ? "warning"
                      : "default"
                  }
                >
                  {selectedSalon.visibility === "hidden_private"
                    ? "Privé & Masqué"
                    : selectedSalon.visibility === "visible_private"
                    ? "Privé & Visible"
                    : "Public"}
                </Badge>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Membres avec accès :</span>
                <span className="text-white font-bold">{selectedSalon.members?.length || 1}</span>
              </div>
            </div>

            {/* Ajouter directement un membre */}
            <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/70 space-y-2">
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <UserPlus className="h-4 w-4 text-emerald-400" />
                Ajouter un membre de la communauté au salon
              </h4>
              <p className="text-[11px] text-slate-400">
                Puisqu&apos;il est déjà dans la communauté, vous l&apos;ajoutez directement au salon (aucune invitation requise).
              </p>
              <div className="flex gap-2">
                <select
                  value={addMemberInput}
                  onChange={(e) => setAddMemberInput(e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg text-xs px-2.5 py-1.5 text-white"
                >
                  <option value="">Choisir parmi les membres de la communauté...</option>
                  {currentComm?.members
                    ?.filter((m) => !selectedSalon.members?.map((sm) => sm.toLowerCase()).includes(m.toLowerCase()))
                    .map((m) => (
                      <option key={m} value={m}>
                        @{m}
                      </option>
                    ))}
                </select>
                <Button size="sm" onClick={handleAddMemberToSalon} disabled={!addMemberInput}>
                  Ajouter au salon
                </Button>
              </div>
            </div>

            {/* Demandes d'adhésion en attente */}
            {selectedSalon.visibility === "visible_private" && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Demandes d&apos;adhésion en attente ({selectedSalon.joinRequests?.length || 0})
                </h4>
                {(!selectedSalon.joinRequests || selectedSalon.joinRequests.length === 0) ? (
                  <p className="text-xs text-slate-400 italic">Aucune demande en attente.</p>
                ) : (
                  <div className="space-y-1">
                    {selectedSalon.joinRequests.map((reqUser) => (
                      <div
                        key={reqUser}
                        className="flex items-center justify-between p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs"
                      >
                        <span className="font-bold text-white font-mono">@{reqUser}</span>
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            onClick={() => handleRespondSalonJoin(reqUser, true)}
                            className="h-6 px-2 text-[10px] bg-emerald-600 hover:bg-emerald-500 text-white"
                          >
                            Accepter
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRespondSalonJoin(reqUser, false)}
                            className="h-6 px-2 text-[10px] text-rose-400 hover:text-rose-300"
                          >
                            Refuser
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Supprimer le salon */}
            {selectedSalon.id !== "general" && (
              <div className="pt-2 border-t border-slate-800">
                <Button
                  variant="destructive"
                  className="w-full gap-2 text-xs"
                  onClick={() => handleDeleteSalon(selectedSalon.id)}
                >
                  <Trash2 className="h-4 w-4" />
                  Supprimer ce salon
                </Button>
              </div>
            )}
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
