"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, NotificationItem } from "@/lib/api";
import { useSocket } from "@/context/SocketContext";
import { Dialog } from "./ui/Dialog";
import { Avatar } from "./ui/Avatar";
import { Button } from "./ui/Button";
import { Badge } from "./ui/Badge";
import { formatTime } from "@/lib/utils";
import {
  Bell,
  MessageSquare,
  AtSign,
  UserPlus,
  Users,
  CheckCheck,
  ExternalLink,
  Lock,
} from "lucide-react";

interface NotificationsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUnreadChange?: (count: number) => void;
}

export function NotificationsModal({ open, onOpenChange, onUnreadChange }: NotificationsModalProps) {
  const router = useRouter();
  const { socket } = useSocket();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchNotifs = async () => {
    try {
      setLoading(true);
      const list = await api.getNotifications();
      setNotifications(list);
      const unread = list.filter((n) => !n.read).length;
      onUnreadChange?.(unread);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchNotifs();
    }
  }, [open]);

  // Real-time synchronization
  useEffect(() => {
    if (!socket) return;

    const handleNewNotif = (notif: NotificationItem) => {
      setNotifications((prev) => [notif, ...prev.filter((n) => n.id !== notif.id)]);
      api.getUnreadNotificationsCount().then((c) => onUnreadChange?.(c)).catch(console.error);
    };

    const handleAllRead = () => {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      onUnreadChange?.(0);
    };

    socket.on("notification:new", handleNewNotif);
    socket.on("notification:all_read", handleAllRead);

    return () => {
      socket.off("notification:new", handleNewNotif);
      socket.off("notification:all_read", handleAllRead);
    };
  }, [socket, onUnreadChange]);

  const handleMarkAllAsRead = async () => {
    try {
      await api.markAllNotificationsAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      onUnreadChange?.(0);
    } catch (e) {
      console.error(e);
    }
  };

  const handleClickNotif = async (notif: NotificationItem) => {
    if (!notif.read) {
      await api.markNotificationAsRead(notif.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n))
      );
      api.getUnreadNotificationsCount().then((c) => onUnreadChange?.(c)).catch(console.error);
    }
    onOpenChange(false);
    if (notif.link) {
      router.push(notif.link);
    }
  };

  const getNotifIcon = (type: NotificationItem["type"]) => {
    switch (type) {
      case "mention":
        return <AtSign className="h-4 w-4 text-amber-400" />;
      case "message":
        return <MessageSquare className="h-4 w-4 text-indigo-400" />;
      case "invite":
        return <Users className="h-4 w-4 text-emerald-400" />;
      case "join_request":
        return <Lock className="h-4 w-4 text-purple-400" />;
      default:
        return <Bell className="h-4 w-4 text-indigo-400" />;
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Centre de Notifications"
      description="Consultez vos mentions, invitations communautaires et nouveaux messages."
    >
      <div className="space-y-3">
        {/* Actions header */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-300">
              Non lues : <strong className="text-indigo-400">{unreadCount}</strong>
            </span>
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllAsRead}
              className="h-7 px-2 text-xs text-indigo-400 hover:text-white gap-1.5"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Tout marquer comme lu
            </Button>
          )}
        </div>

        {/* Notifications list */}
        <div className="max-h-[60vh] overflow-y-auto space-y-2 pr-1">
          {notifications.length === 0 ? (
            <div className="py-8 text-center text-slate-400 space-y-2">
              <Bell className="h-8 w-8 mx-auto text-slate-600 opacity-60" />
              <p className="text-sm font-medium">Aucune notification pour le moment</p>
              <p className="text-xs text-slate-500">
                Vous serez notifié dès qu&apos;un utilisateur vous mentionne ou vous envoie un message.
              </p>
            </div>
          ) : (
            notifications.map((notif) => (
              <div
                key={notif.id}
                onClick={() => handleClickNotif(notif)}
                className={`p-3 rounded-2xl flex items-start gap-3 cursor-pointer transition-all border ${
                  !notif.read
                    ? "bg-indigo-950/30 border-indigo-500/40 hover:bg-indigo-900/30 shadow-md shadow-indigo-500/5"
                    : "bg-slate-900/40 border-slate-800/80 hover:bg-slate-800/50"
                }`}
              >
                {/* Avatar with type badge */}
                <div className="relative shrink-0 mt-0.5">
                  <Avatar
                    src={notif.fromAvatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${notif.fromUser}`}
                    fallback={notif.fromUser}
                    size="sm"
                  />
                  <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center">
                    {getNotifIcon(notif.type)}
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <p className="text-xs font-bold text-white truncate">
                      {notif.title}
                    </p>
                    <span className="text-[10px] text-slate-400 font-mono shrink-0">
                      {formatTime(notif.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-snug break-words">
                    {notif.message}
                  </p>
                </div>

                {/* Unread dot */}
                {!notif.read && (
                  <span className="h-2 w-2 rounded-full bg-indigo-500 shrink-0 mt-2 shadow-sm shadow-indigo-500" />
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </Dialog>
  );
}
