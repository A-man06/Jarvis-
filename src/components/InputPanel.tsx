"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import {
    Send,
    Mic,
    Image as ImageIcon,
    FileUp,
    Sliders,
    Command,
    Paperclip,
    ArrowUp,
    Brain,
    Sparkles,
    Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export const InputPanel = ({
    openControls,
    onSend,
    isLoading
}: {
    openControls: () => void;
    onSend: (content: string) => void;
    isLoading: boolean;
}) => {
    const [input, setInput] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
        }
    }, [input]);

    const handleSend = () => {
        if (!input.trim() || isLoading) return;
        onSend(input);
        setInput("");
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="pb-4 px-4 lg:px-6 bg-transparent">
            <div className="max-w-4xl mx-auto relative">
                {/* Floating Tooltips or presets could go here */}

                <div className="relative glass-dark rounded-2xl border border-white/20 p-1 shadow-2xl transition-all duration-300 hover:border-neon-blue/50 hover:shadow-[0_0_25px_rgba(0,210,255,0.2)] focus-within:border-neon-blue/50 focus-within:ring-1 focus-within:ring-neon-blue/30 shadow-[0_0_15px_rgba(0,210,255,0.08)]">
                    <div className="flex flex-col gap-0.5">
                        <Textarea
                            ref={textareaRef}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Ask anything to JARVIS..."
                            className="min-h-[44px] w-full bg-transparent border-none focus-visible:ring-0 resize-none text-[15px] py-1.5 px-3.5 placeholder:text-white/20"
                            disabled={isLoading}
                        />

                        <div className="flex items-center justify-between px-2 pb-1.5">
                            <div className="flex items-center gap-1">
                                <InputIconButton icon={<ImageIcon className="w-4 h-4" />} label="Upload Image" />
                                <InputIconButton icon={<FileUp className="w-4 h-4" />} label="Upload File" />
                                <InputIconButton icon={<Sliders className="w-4 h-4" />} label="AI Controls" onClick={openControls} />
                            </div>

                            <div className="flex items-center gap-3">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 rounded-full text-white/40 hover:text-neon-blue hover:bg-neon-blue/10"
                                >
                                    <Mic className="w-3.5 h-3.5" />
                                </Button>

                                <Button
                                    onClick={handleSend}
                                    disabled={!input.trim() || isLoading}
                                    className={cn(
                                        "h-9 w-9 rounded-full transition-all duration-300",
                                        input.trim() && !isLoading
                                            ? "bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-[0_0_15px_rgba(59,130,246,0.5)] scale-105"
                                            : "bg-white/5 text-white/20 border border-white/10"
                                    )}
                                >
                                    {isLoading ? (
                                        <Sparkles className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <ArrowUp className="w-4 h-4" />
                                    )}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

const InputIconButton = ({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick?: () => void }) => (
    <Tooltip>
        <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-white/30 hover:text-white hover:bg-white/5 rounded-full" onClick={onClick}>
                {icon}
            </Button>
        </TooltipTrigger>
        <TooltipContent side="top" className="glass-dark border-white/10 text-xs text-white">
            {label}
        </TooltipContent>
    </Tooltip>
);
