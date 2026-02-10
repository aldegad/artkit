"use client";

import { useState } from "react";
import { useAuth } from "@/shared/contexts";
import { useLanguage } from "@/shared/contexts";
import { GoogleIcon } from "@/shared/components/icons";

export function LoginButton() {
  const { signIn, isLoading } = useAuth();
  const { language } = useLanguage();
  const [isSigningIn, setIsSigningIn] = useState(false);

  const t = {
    login: language === "ko" ? "Google 로그인" : "Sign in with Google",
    loggingIn: language === "ko" ? "로그인 중..." : "Signing in...",
  };

  const handleClick = async () => {
    setIsSigningIn(true);
    try {
      await signIn();
    } catch (error) {
      console.error("Sign in failed:", error);
    } finally {
      setIsSigningIn(false);
    }
  };

  const disabled = isLoading || isSigningIn;

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md
                 bg-primary text-primary-foreground hover:bg-primary/90
                 disabled:opacity-50 disabled:cursor-not-allowed
                 transition-colors"
    >
      <GoogleIcon />
      {disabled ? t.loggingIn : t.login}
    </button>
  );
}
