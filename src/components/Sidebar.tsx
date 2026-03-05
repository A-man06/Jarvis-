"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Plus,
    MessageSquare,
    Search,
    Edit2,
    Settings,
    LogOut,
    Sparkles,
    PanelLeft,
    MessageCircle,
    Info,
    Sliders,
    Library,
    X
    Mic,
    MicOff,
    X,
    Volume2,
    VolumeX,
    Bot,
    User
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { auth } from "@/lib/firebase";
import { User as FirebaseUser, signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { User as FirebaseUser } from "firebase/auth";

interface SidebarProps {
    isCollapsed: boolean;
    setIsCollapsed: (value: boolean) => void;
    openSettings: () => void;
    openAuth: () => void;
    onNewChat: () => void;
    onSelectChat: (id: string, title: string) => void;
    onDeleteChat?: (id: string) => void;
    chats: { id: string | number; title: string }[];
    user: FirebaseUser | null;
}

export const Sidebar = ({ isCollapsed, setIsCollapsed, openSettings, openAuth, onNewChat, onSelectChat, onDeleteChat, chats, user }: SidebarProps) => {
interface VoiceMessage {
    role: "user" | "assistant";
    content: string;
    provider?: string;
}

const SESSION_ID = "jarvis-voice-" + Math.random().toString(36).slice(2, 9);

const PROVIDER_COLORS: Record<string, string> = {
    groq: "text-orange-400",
    gemini: "text-green-400",
    cohere: "text-yellow-400",
    huggingface: "text-pink-400",
};

const PROVIDER_ICONS: Record<string, string> = {
    groq: "⚡",
    gemini: "🤖",
    cohere: "🧠",
    huggingface: "🤗",
};

// ✅ Detect language of text
function detectLanguage(text: string): "hi-IN" | "en-US" {
    const isHindi = /[\u0900-\u097F]/.test(text);
    return isHindi ? "hi-IN" : "en-US";
}

export const Sidebar = ({
    isCollapsed, setIsCollapsed, openSettings,
    openAuth, onNewChat, onSelectChat, chats, user
}: SidebarProps) => {
    const router = useRouter();
    const { logout } = useAuth();
    const [searchQuery, setSearchQuery] = useState("");
    const [activeTab, setActiveTab] = useState("Chats");
    const [isSearching, setIsSearching] = useState(false);

    // ─── Voice Chat State ──────────────────────────────────────────────
    const [voiceOpen, setVoiceOpen] = useState(false);
    const [voiceMessages, setVoiceMessages] = useState<VoiceMessage[]>([]);
    const [isVoiceRecording, setIsVoiceRecording] = useState(false);
    const [voiceLoading, setVoiceLoading] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const voiceRecognitionRef = useRef<any>(null);
    const voiceBottomRef = useRef<HTMLDivElement>(null);
    const voiceMessagesRef = useRef<VoiceMessage[]>([]);

    useEffect(() => {
        voiceMessagesRef.current = voiceMessages;
    }, [voiceMessages]);

    const navItems = [
        { id: "new", icon: <Plus className="w-4.5 h-4.5" />, label: "New chat" },
        { id: "search", icon: <Search className="w-4.5 h-4.5" />, label: "Search" },
        { id: "customize", icon: <Sliders className="w-4.5 h-4.5" />, label: "Customize" },
        { id: "Chats", icon: <MessageCircle className="w-4.5 h-4.5" />, label: "Chats" },
        { id: "projects", icon: <Library className="w-4.5 h-4.5" />, label: "Projects" },
    ];

    // ✅ Hindi + English voice support
    function speakText(text: string) {
        window.speechSynthesis.cancel();

        setTimeout(() => {
            const lang = detectLanguage(text);
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 0.95;
            utterance.pitch = 1;
            utterance.volume = 1;
            utterance.lang = lang;

            const trySpeak = () => {
                const voices = window.speechSynthesis.getVoices();

                if (lang === "hi-IN") {
                    // Try to find Hindi voice
                    const hindiVoice = voices.find(v =>
                        v.lang === "hi-IN" ||
                        v.lang.startsWith("hi") ||
                        v.name.toLowerCase().includes("hindi") ||
                        v.name.includes("Lekha") ||
                        v.name.includes("Kalpana")
                    );
                    if (hindiVoice) {
                        utterance.voice = hindiVoice;
                    }
                    // If no Hindi voice found, it will still try to speak
                    // using default voice with hi-IN lang set
                } else {
                    // English voice
                    const englishVoice = voices.find(v =>
                        v.name === "Google US English" ||
                        v.name === "Samantha" ||
                        (v.lang === "en-US" && v.localService)
                    );
                    if (englishVoice) utterance.voice = englishVoice;
                }

                utterance.onstart = () => setIsSpeaking(true);
                utterance.onend = () => {
                    setIsSpeaking(false);
                    window.speechSynthesis.onvoiceschanged = null;
                };
                utterance.onerror = () => setIsSpeaking(false);
                window.speechSynthesis.speak(utterance);
            };

            if (window.speechSynthesis.getVoices().length > 0) {
                trySpeak();
            } else {
                window.speechSynthesis.onvoiceschanged = trySpeak;
            }
        }, 150);
    }

    async function getAIResponse(
        userMessage: string,
        history: VoiceMessage[]
    ): Promise<{ content: string; provider: string }> {
        const res = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: userMessage,
                sessionId: SESSION_ID,
                history: history.slice(-10).map(m => ({
                    role: m.role,
                    content: m.content,
                })),
            }),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let accumulatedData = "";
        let fullContent = "";
        let provider = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            accumulatedData += decoder.decode(value, { stream: true });
            const lines = accumulatedData.split("\n");
            accumulatedData = lines.pop() || "";

            for (const line of lines) {
                if (!line.trim() || !line.startsWith("data:")) continue;
                const data = line.replace("data: ", "").trim();
                if (data === "[DONE]") continue;
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.content) {
                        fullContent += parsed.content;
                        if (parsed.provider) provider = parsed.provider;
                    }
                    if (parsed.error) throw new Error(parsed.error);
                } catch (e) { }
            }
        }

        if (!fullContent) throw new Error("Empty response from AI");
        return { content: fullContent, provider };
    }

    // ✅ Auto detect language for mic too
    function toggleVoiceRecording() {
        const SpeechRecognition =
            (window as any).SpeechRecognition ||
            (window as any).webkitSpeechRecognition;

        if (!SpeechRecognition) {
            alert("Speech recognition not supported. Use Chrome or Edge.");
            return;
        }

        if (isVoiceRecording) {
            voiceRecognitionRef.current?.stop();
            setIsVoiceRecording(false);
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        // ✅ Use browser default language — auto picks Hindi or English
        recognition.lang = navigator.language || "en-US";

        recognition.onresult = async (event: any) => {
            const transcript = event.results[0][0].transcript;
            setIsVoiceRecording(false);

            // ✅ Detect if user spoke Hindi by checking Devanagari characters
            const isHindi = /[\u0900-\u097F]/.test(transcript);
            const langLabel = isHindi ? "Hindi" : "English";

            console.log(`[Voice] Detected language: ${langLabel}, transcript: ${transcript}`);

            const currentHistory = voiceMessagesRef.current;
            const userMsg: VoiceMessage = { role: "user", content: transcript };

            setVoiceMessages([...currentHistory, userMsg, { role: "assistant", content: "" }]);
            setVoiceLoading(true);

            try {
                // ✅ Prepend language instruction so AI replies in same language
                const messageWithLang = `[Reply strictly in ${langLabel} only] ${transcript}`;

                const { content, provider } = await getAIResponse(
                    messageWithLang,
                    currentHistory
                );

                setVoiceMessages(prev => {
                    const newMsgs = [...prev];
                    newMsgs[newMsgs.length - 1] = { role: "assistant", content, provider };
                    return newMsgs;
                });

                // ✅ Speak in detected language
                speakText(content);

                setTimeout(() => {
                    voiceBottomRef.current?.scrollIntoView({ behavior: "smooth" });
                }, 100);

            } catch (err: any) {
                console.error("[Voice] Error:", err.message);
                setVoiceMessages(prev => {
                    const newMsgs = [...prev];
                    newMsgs[newMsgs.length - 1] = {
                        role: "assistant",
                        content: "Sorry, I couldn't get a response. Please try again.",
                    };
                    return newMsgs;
                });
            } finally {
                setVoiceLoading(false);
            }
        };

        recognition.onend = () => setIsVoiceRecording(false);
        recognition.onerror = (e: any) => {
            console.error("[Voice] Recognition error:", e.error);
            setIsVoiceRecording(false);
        };

        voiceRecognitionRef.current = recognition;
        recognition.start();
        setIsVoiceRecording(true);
    }

    return (
        <>
            <motion.aside
                initial={false}
                animate={{ width: isCollapsed ? 52 : 260 }}
                className="h-screen flex flex-col bg-[#020617]/90 backdrop-blur-2xl relative z-50 overflow-hidden border-r border-white/10"
            >
                {/* Header */}
                <div className="h-14 flex items-center justify-between px-3 flex-shrink-0">
                    {!isCollapsed && (
                        <motion.span
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="text-3xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-neon-blue via-white to-neon-purple pl-2 drop-shadow-[0_0_25px_rgba(0,210,255,0.7)]"
                        >
                            JARVIS
                        </motion.span>
                    )}
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setIsCollapsed(!isCollapsed)}
                                className={cn(
                                    "text-white/40 hover:text-white hover:bg-white/5 rounded-lg transition-all h-9 w-9",
                                    isCollapsed && "w-full mx-0"
                                )}
                            >
                                <PanelLeft className="w-5 h-5" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="right">{isCollapsed ? "Expand" : "Collapse"}</TooltipContent>
                    </Tooltip>
                </div>

                {/* Navigation */}
                <ScrollArea className="flex-1 no-scrollbar">
                    <div className="flex flex-col py-2 px-2 gap-0.5">
                        {navItems.map((item) => (
                            <Tooltip key={item.id} delayDuration={isCollapsed ? 0 : 500}>
                                <TooltipTrigger asChild>
                                    <motion.div
                                        onClick={() => {
                                            setActiveTab(item.id);
                                            if (item.id === "new") onNewChat();
                                            if (item.id === "customize") openSettings();
                                            if (item.id === "search") setIsSearching(!isSearching);
                                        }}
                                        className={cn(
                                            "flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer transition-all group",
                                            activeTab === item.id ? "bg-white/10 text-white" : "text-white/40 hover:text-white hover:bg-white/5",
                                            isCollapsed && "justify-center px-0"
                                        )}
                                    >
                                        <div className="flex-shrink-0">
                                            {item.id === "new" ? (
                                                <div className={cn(
                                                    "flex items-center justify-center rounded-full bg-white/5 group-hover:bg-white/10",
                                                    isCollapsed ? "w-7 h-7" : "w-5 h-5 mr-1"
                                                )}>
                                                    <Plus className="w-3.5 h-3.5" />
                                                </div>
                                            ) : (
                                                <div className={cn(isCollapsed && "w-7 h-7 flex items-center justify-center")}>
                                                    {item.icon}
                                                </div>
                                            )}
                                        </div>
                                        {!isCollapsed && (
                                            <span className="text-[13.5px] font-medium">{item.label}</span>
                                        )}
                                    </motion.div>
                                </TooltipTrigger>
                                {isCollapsed && <TooltipContent side="right">{item.label}</TooltipContent>}
                            </Tooltip>
                        ))}

                        <AnimatePresence>
                            {isSearching && !isCollapsed && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="px-3 overflow-hidden mt-1"
                                >
                                    <div className="relative">
                                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/20" />
                                        <Input
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            placeholder="Search history..."
                                            className="h-8 bg-white/5 border-white/5 pl-8 text-[12px] placeholder:text-white/20 rounded-lg focus-visible:ring-neon-blue/20"
                                        />
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {!isCollapsed && (
                            <div className="mt-8 px-3 flex flex-col flex-1 min-h-0">
                                <p className="text-[10px] font-bold text-white/20 uppercase tracking-[0.1em] mb-4">Recents</p>
                                <ScrollArea className="flex-1 -mx-2 px-2">
                                    <div className="space-y-1 pb-4">
                                        {chats
                                            .filter(chat => chat.title.toLowerCase().includes(searchQuery.toLowerCase()))
                                            .map(chat => (
                                                <div
                                                    key={chat.id}
                                                    onClick={() => onSelectChat(chat.id.toString(), chat.title)}
                                                    className="text-[13px] text-white/50 hover:text-white transition-colors cursor-pointer truncate py-1.5 rounded-lg hover:bg-white/5 px-2 active:bg-white/10"
                                                >
                                                    {chat.title}
                                                </div>
                                            ))}
                                    </div>
                                </ScrollArea>
                            </div>
                        )}
                    </div>
                </ScrollArea>

                {/* Talk to Jarvis Button */}
                <div className="px-2 pb-2">
                    <Tooltip delayDuration={isCollapsed ? 0 : 500}>
                        <TooltipTrigger asChild>
                            <motion.div
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => setVoiceOpen(true)}
                                className={cn(
                                    "flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer transition-all group",
                                    "bg-gradient-to-r from-neon-blue/10 via-neon-purple/5 to-neon-blue/10",
                                    "border border-white/5 hover:border-neon-blue/30 hover:bg-white/5",
                                    isCollapsed && "justify-center px-0"
                                )}
                            >
                                <div className="relative">
                                    <Mic className={cn(
                                        "w-5 h-5 text-neon-blue group-hover:text-white transition-colors",
                                        "drop-shadow-[0_0_10px_rgba(0,210,255,0.8)]"
                                    )} />
                                    <motion.div
                                        animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0.8, 0.5] }}
                                        transition={{ duration: 2, repeat: Infinity }}
                                        className="absolute inset-0 bg-neon-blue/20 rounded-full blur-md -z-10"
                                    />
                                </div>
                                {!isCollapsed && (
                                    <div className="flex flex-col">
                                        <span className="text-[13.5px] font-bold text-white group-hover:text-neon-blue transition-colors">Talk to Jarvis</span>
                                        <span className="text-[10px] text-white/40 font-medium">Voice Interaction</span>
                                    </div>
                                )}
                            </motion.div>
                        </TooltipTrigger>
                        {isCollapsed && <TooltipContent side="right">Talk to Jarvis</TooltipContent>}
                    </Tooltip>
                </div>

                {/* Footer */}
                <div className="p-2 border-t border-white/5">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <div className={cn(
                                "flex items-center justify-between p-2 rounded-xl hover:bg-white/5 transition-all group cursor-pointer",
                                isCollapsed && "justify-center px-0"
                            )}>
                                <div className="flex items-center gap-3 truncate">
                                    <Avatar className="w-8 h-8 flex-shrink-0 border border-white/10">
                                        <AvatarFallback className="bg-[#aca796] text-[#1c1c1c] text-xs font-bold font-mono">
                                            {user?.displayName ? user.displayName[0].toUpperCase() : (user?.email ? user.email[0].toUpperCase() : "?")}
                                        </AvatarFallback>
                                    </Avatar>
                                    {!isCollapsed && (
                                        <div className="flex flex-col truncate">
                                            <span className="text-sm font-bold text-white/90 leading-tight">
                                                {user?.displayName || (user?.email?.split("@")[0]) || "Anonymous"}
                                            </span>
                                            <span className="text-[11px] text-white/30 font-medium tracking-tight">
                                                {user ? "Pro plan" : "Not Logged In"}
                                            </span>
                                        </div>
                                    )}
                                </div>
                                {!isCollapsed && <Settings className="w-4 h-4 text-white/20 group-hover:text-white transition-colors" />}
                            </div>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 glass-dark border-white/10 text-white p-1 mb-2">
                            {user ? (
                                <>
                                    <DropdownMenuItem className="focus:bg-white/10 rounded-lg cursor-pointer flex items-center gap-2 py-2" onClick={openSettings}>
                                        <Settings className="w-4 h-4" /> Settings
                                    </DropdownMenuItem>
                                    <DropdownMenuItem className="focus:bg-white/10 rounded-lg cursor-pointer flex items-center gap-2 py-2">
                                        <Info className="w-4 h-4" /> About
                                    </DropdownMenuItem>
                                    <Separator className="bg-white/5 my-1" />
                                    <DropdownMenuItem
                                        className="focus:bg-white/10 rounded-lg cursor-pointer flex items-center gap-2 py-2 text-red-400 focus:text-red-300"
                                        onClick={() => signOut(auth)}
                                    >
                                        <LogOut className="w-4 h-4" /> Logout
                                    </DropdownMenuItem>
                                </>
                            ) : (
                                <DropdownMenuItem className="focus:bg-white/10 rounded-lg cursor-pointer flex items-center gap-2 py-2" onClick={openAuth}>
                                    <LogOut className="w-4 h-4" /> Login
                                </DropdownMenuItem>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </motion.aside>

            {/* ── Voice Chat Modal ── */}
            <AnimatePresence>
                {voiceOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
                        onClick={(e) => {
                            if (e.target === e.currentTarget) {
                                window.speechSynthesis.cancel();
                                setVoiceOpen(false);
                            }
                        }}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="w-[420px] h-[580px] bg-[#020617] border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden"
                            style={{ boxShadow: "0 0 40px rgba(0,210,255,0.15)" }}
                        >
                            {/* Modal Header */}
                            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
                                <div className="flex items-center gap-3">
                                    <div className="relative">
                                        <Mic className="w-5 h-5 text-neon-blue drop-shadow-[0_0_10px_rgba(0,210,255,0.8)]" />
                                        <motion.div
                                            animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                                            transition={{ duration: 2, repeat: Infinity }}
                                            className="absolute inset-0 bg-neon-blue/30 rounded-full blur-md -z-10"
                                        />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-white">Talk to JARVIS</p>
                                        <p className="text-[10px] text-white/30">
                                            {isSpeaking ? "🔊 Speaking..." : isVoiceRecording ? "🔴 Listening..." : voiceLoading ? "⚡ Racing AIs..." : "Voice Mode • Hindi & English"}
                                        </p>
                                    </div>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                        window.speechSynthesis.cancel();
                                        setIsSpeaking(false);
                                        setVoiceOpen(false);
                                    }}
                                    className="h-8 w-8 text-white/30 hover:text-white rounded-full"
                                >
                                    <X className="w-4 h-4" />
                                </Button>
                            </div>

                            {/* Messages */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                {voiceMessages.length === 0 && (
                                    <div className="h-full flex flex-col items-center justify-center text-center space-y-4 p-6">
                                        <motion.div
                                            animate={{ scale: [1, 1.1, 1] }}
                                            transition={{ duration: 2, repeat: Infinity }}
                                            className="w-20 h-20 rounded-full bg-neon-blue/10 border border-neon-blue/20 flex items-center justify-center"
                                        >
                                            <Mic className="w-8 h-8 text-neon-blue" />
                                        </motion.div>
                                        <p className="text-white/60 text-sm">Press the mic and start talking</p>
                                        <p className="text-white/20 text-xs">Hindi & English both supported 🇮🇳 🇺🇸</p>
                                        <div className="flex gap-2 text-xs text-white/20">
                                            <span>⚡ Groq</span>
                                            <span>🤖 Gemini</span>
                                            <span>🧠 Cohere</span>
                                            <span>🤗 HuggingFace</span>
                                        </div>
                                    </div>
                                )}

                                {voiceMessages.map((msg, i) => (
                                    <div key={i} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
                                        <div className="flex items-end gap-2">
                                            {msg.role === "assistant" && (
                                                <div className="w-6 h-6 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                                                    <Bot className="w-3 h-3 text-blue-400" />
                                                </div>
                                            )}
                                            <div className={cn(
                                                "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
                                                msg.role === "user"
                                                    ? "bg-blue-600/20 text-white border border-blue-500/20 rounded-tr-none"
                                                    : "bg-white/5 text-gray-200 border border-white/10 rounded-tl-none"
                                            )}>
                                                {msg.content || (
                                                    <div className="flex gap-1 py-1 items-center">
                                                        <span className="text-xs text-white/30 mr-1">Racing AIs</span>
                                                        <motion.span animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1 }} className="w-1.5 h-1.5 bg-neon-blue rounded-full" />
                                                        <motion.span animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1.5 h-1.5 bg-neon-purple rounded-full" />
                                                        <motion.span animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1.5 h-1.5 bg-neon-blue rounded-full" />
                                                    </div>
                                                )}
                                            </div>
                                            {msg.role === "user" && (
                                                <div className="w-6 h-6 rounded-full bg-purple-600/20 border border-purple-500/30 flex items-center justify-center flex-shrink-0">
                                                    <User className="w-3 h-3 text-purple-400" />
                                                </div>
                                            )}
                                        </div>
                                        {msg.role === "assistant" && msg.provider && msg.content && (
                                            <div className={cn("mt-1 ml-8 text-[10px] flex items-center gap-1", PROVIDER_COLORS[msg.provider] || "text-gray-500")}>
                                                <span>{PROVIDER_ICONS[msg.provider] || "🤖"}</span>
                                                <span className="capitalize">{msg.provider} won</span>
                                            </div>
                                        )}
                                    </div>
                                ))}
                                <div ref={voiceBottomRef} />
                            </div>

                    <AnimatePresence>
                        {isSearching && !isCollapsed && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="px-3 overflow-hidden mt-1"
                            >
                                <div className="relative">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/20" />
                                    <Input
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="Search history..."
                                        className="h-8 bg-white/5 border-white/5 pl-8 text-[12px] placeholder:text-white/20 rounded-lg focus-visible:ring-neon-blue/20"
                                    />
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {!isCollapsed && (
                        <div className="mt-8 px-3 flex flex-col flex-1 min-h-0">
                            <p className="text-[10px] font-bold text-white/20 uppercase tracking-[0.1em] mb-4">Recents</p>
                            <ScrollArea className="flex-1 -mx-2 px-2">
                                <div className="space-y-1 pb-4">
                                    {chats
                                        .filter(chat => chat.title.toLowerCase().includes(searchQuery.toLowerCase()))
                                        .map(chat => (
                                            <div
                                                key={chat.id}
                                                className="group/item flex items-center justify-between gap-2 text-[13px] text-white/50 hover:text-white transition-colors cursor-pointer py-1.5 rounded-lg hover:bg-white/5 px-2 active:bg-white/10"
                                            >
                                                <span
                                                    onClick={() => onSelectChat(chat.id.toString(), chat.title)}
                                                    className="truncate flex-1"
                                                >
                                                    {chat.title}
                                                </span>
                                                {onDeleteChat && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onDeleteChat(chat.id.toString());
                                                        }}
                                                        className="opacity-0 group-hover/item:opacity-40 hover:!opacity-100 transition-opacity p-1 hover:bg-red-500/10 hover:text-red-400 rounded-md"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                </div>
                            </ScrollArea>
                        </div>
                    )}
                </div>
            </ScrollArea>

            {/* Footer Section */}
            <div className="p-2 border-t border-white/5">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <div className={cn(
                            "flex items-center justify-between p-2 rounded-xl hover:bg-white/5 transition-all group cursor-pointer",
                            isCollapsed && "justify-center px-0"
                        )}>
                            <div className="flex items-center gap-3 truncate">
                                <Avatar className="w-8 h-8 flex-shrink-0 border border-white/10">
                                    <AvatarFallback className="bg-[#aca796] text-[#1c1c1c] text-xs font-bold font-mono">
                                        {user?.displayName ? user.displayName[0].toUpperCase() : (user?.email ? user.email[0].toUpperCase() : "?")}
                                    </AvatarFallback>
                                </Avatar>
                                {!isCollapsed && (
                                    <div className="flex flex-col truncate">
                                        <span className="text-sm font-bold text-white/90 leading-tight">
                                            {user?.displayName || (user?.email?.split('@')[0]) || "Anonymous"}
                                        </span>
                                        <span className="text-[11px] text-white/30 font-medium tracking-tight">
                                            {user ? "Pro plan" : "Not Logged In"}
                                        </span>
                                    </div>
                                )}
                            </div>
                            {!isCollapsed && <Settings className="w-4 h-4 text-white/20 group-hover:text-white transition-colors" />}
                        </div>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56 glass-dark border-white/10 text-white p-1 mb-2">
                        {user ? (
                            <>
                                <DropdownMenuItem className="focus:bg-white/10 rounded-lg cursor-pointer flex items-center gap-2 py-2" onClick={openSettings}>
                                    <Settings className="w-4 h-4" /> Settings
                                </DropdownMenuItem>
                                <DropdownMenuItem className="focus:bg-white/10 rounded-lg cursor-pointer flex items-center gap-2 py-2">
                                    <Info className="w-4 h-4" /> About
                                </DropdownMenuItem>
                                <Separator className="bg-white/5 my-1" />
                                <DropdownMenuItem
                                    className="focus:bg-white/10 rounded-lg cursor-pointer flex items-center gap-2 py-2 text-red-400 focus:text-red-300"
                                    onClick={() => logout()}
                            {/* Voice Controls */}
                            <div className="p-4 border-t border-white/10 flex flex-col items-center gap-3 bg-white/[0.02]">
                                {isSpeaking && (
                                    <div className="flex items-center gap-2">
                                        <motion.div
                                            animate={{ scale: [1, 1.2, 1] }}
                                            transition={{ repeat: Infinity, duration: 0.5 }}
                                            className="text-xs text-green-400 flex items-center gap-1"
                                        >
                                            <Volume2 className="w-3 h-3" /> JARVIS is speaking...
                                        </motion.div>
                                        <button
                                            onClick={() => {
                                                window.speechSynthesis.cancel();
                                                setIsSpeaking(false);
                                            }}
                                            className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                                        >
                                            <VolumeX className="w-3 h-3" /> Stop
                                        </button>
                                    </div>
                                )}

                                <motion.button
                                    whileTap={{ scale: 0.95 }}
                                    onClick={toggleVoiceRecording}
                                    disabled={voiceLoading || isSpeaking}
                                    className={cn(
                                        "w-16 h-16 rounded-full flex items-center justify-center text-white transition-all shadow-lg disabled:opacity-40",
                                        isVoiceRecording
                                            ? "bg-red-500 shadow-[0_0_30px_rgba(239,68,68,0.5)]"
                                            : "bg-gradient-to-br from-neon-blue/80 to-neon-purple/80 shadow-[0_0_20px_rgba(0,210,255,0.3)] hover:shadow-[0_0_30px_rgba(0,210,255,0.5)]"
                                    )}
                                >
                                    {voiceLoading ? (
                                        <Sparkles className="w-6 h-6 animate-spin" />
                                    ) : isVoiceRecording ? (
                                        <MicOff className="w-6 h-6" />
                                    ) : (
                                        <Mic className="w-6 h-6" />
                                    )}
                                </motion.button>

                                <p className="text-[11px] text-white/30">
                                    {voiceLoading ? "Racing 4 AIs for best answer..." : isVoiceRecording ? "Listening... click to stop" : "बोलिए / Speak"}
                                </p>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
};

const ChatItem = ({ title }: { title: string }) => {
    return (
        <motion.div
            whileHover={{ x: 4 }}
            className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 group cursor-pointer transition-colors"
        >
            <MessageSquare className="w-4 h-4 text-white/20 group-hover:text-blue-400 transition-colors" />
            <span className="text-sm text-white/60 group-hover:text-white truncate flex-1 font-medium transition-colors">
                {title}
            </span>
            <Edit2 className="w-3.5 h-3.5 text-white/0 group-hover:text-white/20 hover:text-white transition-all scale-0 group-hover:scale-100" />
        </motion.div>
    );
};